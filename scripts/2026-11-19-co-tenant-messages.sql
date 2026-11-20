-- Co-tenants (tenancy_occupants) couldn't message their landlord and the
-- landlord couldn't message them: the original functions only knew the
-- primary tenant ("No active tenancy between these users"). Builds on
-- 2026-11-19-pm-direct-messages.sql (run that first).

-- The owner ids a landlord acts as: themselves plus any primary landlord
-- they're an accepted co-owner of.
create or replace function public.landlord_owner_ids_for(landlord_user uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select array[landlord_user] || coalesce(array_agg(c.primary_landlord_user_id), '{}')
  from landlord_co_owners c
  where c.co_owner_user_id = landlord_user and c.status = 'accepted'
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

  -- A landlord: co-tenants on their own (or co-owned) units.
  return query
    select o.renter_user_id, 'renter'::text, u.full_name::text, 'Co-tenant'::text, null::text, null::timestamptz,
           (select d.id from dm_threads d where d.landlord_user_id = me and d.other_user_id = o.renter_user_id limit 1)
    from tenancy_occupants o join tenancies t on t.id = o.tenancy_id join units un on un.id = t.unit_id join properties pr on pr.id = un.property_id
    join users u on u.id = o.renter_user_id
    where pr.owner_user_id = any(landlord_owner_ids_for(me)) and t.ended = false and o.renter_user_id <> me;

  -- A co-tenant: their landlord.
  return query
    select distinct pr.owner_user_id, 'landlord'::text, u.full_name::text, 'Landlord'::text, null::text, null::timestamptz,
           (select d.id from dm_threads d where d.landlord_user_id = pr.owner_user_id and d.other_user_id = me limit 1)
    from tenancy_occupants o join tenancies t on t.id = o.tenancy_id join units un on un.id = t.unit_id join properties pr on pr.id = un.property_id
    join users u on u.id = pr.owner_user_id
    where o.renter_user_id = me and t.ended = false and pr.owner_user_id <> me;

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
     and (
       -- the landlord (or co-owner) of a unit where this person is a tenant or co-tenant
       p_renter_user_id in (select renter_user_ids_for_owners(landlord_owner_ids_for(p_landlord_user_id)))
       -- or a PM whose client rents to them
       or exists (select 1 from pm_owner_ids_for(p_landlord_user_id) o(id) where p_renter_user_id in (select renter_user_ids_for_owners(array[o.id])))
     ) then
    select id into tid from dm_threads where landlord_user_id = p_landlord_user_id and other_user_id = p_renter_user_id limit 1;
    if tid is null then
      insert into dm_threads (landlord_user_id, other_user_id, other_role) values (p_landlord_user_id, p_renter_user_id, 'renter') returning id into tid;
    end if;
    return tid;
  end if;
  return start_landlord_tenant_thread_base(p_landlord_user_id, p_renter_user_id);
end;
$$;

revoke all on function public.landlord_owner_ids_for(uuid) from public, anon;
grant execute on function public.get_dm_contacts() to authenticated;
grant execute on function public.start_landlord_tenant_thread(uuid, uuid) to authenticated, service_role;
