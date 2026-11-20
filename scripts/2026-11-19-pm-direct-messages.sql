-- Property managers couldn't direct-message their clients' tenants or
-- contractors (empty contact list; "No active tenancy between these
-- users"), and tenants/contractors couldn't message the PM managing their
-- home. The existing functions are kept unchanged (renamed *_base); these
-- wrappers add the PM cases on top. Needs pm_managed_owner_ids() from
-- 2026-11-19-pm-can-see-names.sql (run that one first).

alter function public.get_dm_contacts() rename to get_dm_contacts_base;
alter function public.start_landlord_tenant_thread(uuid, uuid) rename to start_landlord_tenant_thread_base;
alter function public.start_landlord_contractor_thread(uuid, uuid) rename to start_landlord_contractor_thread_base;

-- Owners whose PM company `pm_user` belongs to (any accepted member).
create or replace function public.pm_owner_ids_for(pm_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.owner_user_id
  from pm_organization_members m
  join pm_client_portfolios p on p.organization_id = m.organization_id and p.status = 'accepted'
  where m.user_id = pm_user and m.status = 'accepted'
$$;

-- Renters with an active lease (primary or co-tenant) on these owners' units.
create or replace function public.renter_user_ids_for_owners(owner_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.renter_user_id from tenancies t join units u on u.id = t.unit_id join properties pr on pr.id = u.property_id
   where pr.owner_user_id = any(owner_ids) and t.ended = false and t.renter_user_id is not null
  union
  select o.renter_user_id from tenancy_occupants o join tenancies t on t.id = o.tenancy_id join units u on u.id = t.unit_id join properties pr on pr.id = u.property_id
   where pr.owner_user_id = any(owner_ids) and t.ended = false and o.renter_user_id is not null
$$;

-- Contractors with an accepted bid on these owners' jobs.
create or replace function public.contractor_user_ids_for_owners(owner_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct b.contractor_user_id from bids b join jobs j on j.id = b.job_id join units u on u.id = j.unit_id join properties pr on pr.id = u.property_id
   where pr.owner_user_id = any(owner_ids) and b.status = 'accepted'
$$;

create or replace function public.get_dm_contacts()
returns table (other_user_id uuid, other_role text, full_name text, context_label text, last_job_category text, last_job_completed_at timestamptz, thread_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_owner_ids uuid[];
begin
  return query
    select b.other_user_id, b.other_role::text, b.full_name::text, b.context_label::text, b.last_job_category::text, b.last_job_completed_at::timestamptz, b.thread_id
    from get_dm_contacts_base() b;

  -- A PM: their clients' tenants and contractors.
  select array_agg(x) into my_owner_ids from pm_managed_owner_ids() x;
  if my_owner_ids is not null then
    return query
      select r.id, 'renter'::text, u.full_name::text, 'Client tenant'::text, null::text, null::timestamptz,
             (select d.id from dm_threads d where d.landlord_user_id = me and d.other_user_id = r.id limit 1)
      from renter_user_ids_for_owners(my_owner_ids) r(id) join users u on u.id = r.id
      where r.id <> me;
    return query
      select c.id, 'contractor'::text, u.full_name::text, 'Client contractor'::text, null::text, null::timestamptz,
             (select d.id from dm_threads d where d.landlord_user_id = me and d.other_user_id = c.id limit 1)
      from contractor_user_ids_for_owners(my_owner_ids) c(id) join users u on u.id = c.id
      where c.id <> me;
  end if;

  -- A tenant or contractor: the PM company (its admin) managing their home or job.
  return query
    select distinct o.admin_user_id, 'landlord'::text, (o.name || ' (property manager)')::text, 'Property manager'::text, null::text, null::timestamptz,
           (select d.id from dm_threads d where d.landlord_user_id = o.admin_user_id and d.other_user_id = me limit 1)
    from pm_organizations o
    join pm_client_portfolios p on p.organization_id = o.id and p.status = 'accepted'
    where o.admin_user_id is not null and o.admin_user_id <> me
      and (me in (select renter_user_ids_for_owners(array[p.owner_user_id])) or me in (select contractor_user_ids_for_owners(array[p.owner_user_id])));
end;
$$;

create or replace function public.start_landlord_tenant_thread(p_landlord_user_id uuid, p_renter_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  if auth.uid() in (p_landlord_user_id, p_renter_user_id)
     and exists (select 1 from pm_owner_ids_for(p_landlord_user_id) o(id) where p_renter_user_id in (select renter_user_ids_for_owners(array[o.id]))) then
    select id into tid from dm_threads where landlord_user_id = p_landlord_user_id and other_user_id = p_renter_user_id limit 1;
    if tid is null then
      insert into dm_threads (landlord_user_id, other_user_id, other_role) values (p_landlord_user_id, p_renter_user_id, 'renter') returning id into tid;
    end if;
    return tid;
  end if;
  return start_landlord_tenant_thread_base(p_landlord_user_id, p_renter_user_id);
end;
$$;

create or replace function public.start_landlord_contractor_thread(p_landlord_user_id uuid, p_contractor_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  if auth.uid() in (p_landlord_user_id, p_contractor_user_id)
     and exists (select 1 from pm_owner_ids_for(p_landlord_user_id) o(id) where p_contractor_user_id in (select contractor_user_ids_for_owners(array[o.id]))) then
    select id into tid from dm_threads where landlord_user_id = p_landlord_user_id and other_user_id = p_contractor_user_id limit 1;
    if tid is null then
      insert into dm_threads (landlord_user_id, other_user_id, other_role) values (p_landlord_user_id, p_contractor_user_id, 'contractor') returning id into tid;
    end if;
    return tid;
  end if;
  return start_landlord_contractor_thread_base(p_landlord_user_id, p_contractor_user_id);
end;
$$;

revoke all on function public.get_dm_contacts_base() from public, anon;
revoke all on function public.start_landlord_tenant_thread_base(uuid, uuid) from public, anon;
revoke all on function public.start_landlord_contractor_thread_base(uuid, uuid) from public, anon;
revoke all on function public.pm_owner_ids_for(uuid) from public, anon;
revoke all on function public.renter_user_ids_for_owners(uuid[]) from public, anon;
revoke all on function public.contractor_user_ids_for_owners(uuid[]) from public, anon;
grant execute on function public.get_dm_contacts_base() to authenticated, service_role;
grant execute on function public.start_landlord_tenant_thread_base(uuid, uuid) to authenticated, service_role;
grant execute on function public.start_landlord_contractor_thread_base(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_dm_contacts() to authenticated;
grant execute on function public.start_landlord_tenant_thread(uuid, uuid) to authenticated, service_role;
grant execute on function public.start_landlord_contractor_thread(uuid, uuid) to authenticated, service_role;
