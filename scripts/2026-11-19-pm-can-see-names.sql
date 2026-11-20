-- A property manager saw "Reported by Unknown" and blank contractor names on
-- client jobs: get_user_by_id only knew about owners, tenants and
-- contractors, not PMs. The existing rules are kept as they are (renamed to
-- get_user_by_id_base); this adds one more case on top: a PM member can see
-- the name/contact of people tied to the clients they manage (the owner,
-- that owner's tenants and co-tenants, and anyone who reported or bid on a
-- job at that owner's properties). Staff limited to specific clients only
-- see those clients' people.

alter function public.get_user_by_id(uuid) rename to get_user_by_id_base;

create or replace function public.pm_managed_owner_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.owner_user_id
  from pm_organization_members m
  join pm_client_portfolios p on p.organization_id = m.organization_id and p.status = 'accepted'
  where m.user_id = auth.uid()
    and m.status = 'accepted'
    and (
      m.member_role = 'admin'
      or coalesce(m.scope_all_clients, true)
      or exists (select 1 from pm_staff_client_access a where a.member_id = m.id and a.owner_user_id = p.owner_user_id)
    )
$$;

create or replace function public.get_user_by_id(user_id_input uuid)
returns table (full_name text, email text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query select b.full_name::text, b.email::text, b.phone::text from get_user_by_id_base(user_id_input) b;
  if found then
    return;
  end if;

  if exists (
    with owners as (select pm_managed_owner_ids() as id),
         props as (select pr.id from properties pr where pr.owner_user_id in (select id from owners)),
         unit_ids as (select u.id from units u where u.property_id in (select id from props)),
         job_ids as (select j.id, j.reported_by from jobs j where j.unit_id in (select id from unit_ids))
    select 1 where
      user_id_input in (select id from owners)
      or exists (select 1 from tenancies t where t.unit_id in (select id from unit_ids) and t.renter_user_id = user_id_input)
      or exists (select 1 from tenancy_occupants o join tenancies t on t.id = o.tenancy_id where t.unit_id in (select id from unit_ids) and o.renter_user_id = user_id_input)
      or exists (select 1 from job_ids where reported_by = user_id_input)
      or exists (select 1 from bids bd where bd.job_id in (select id from job_ids) and bd.contractor_user_id = user_id_input)
  ) then
    return query select u.full_name::text, u.email::text, u.phone::text from users u where u.id = user_id_input;
  end if;
end;
$$;

revoke all on function public.get_user_by_id_base(uuid) from public, anon;
grant execute on function public.get_user_by_id_base(uuid) to authenticated;
grant execute on function public.get_user_by_id(uuid) to authenticated;
grant execute on function public.pm_managed_owner_ids() to authenticated;
