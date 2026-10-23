-- Adds email to get_users_by_ids' return columns — purely additive, the
-- three existing call sites (landlord rent/jobs/reports pages) only ever
-- destructured full_name, so this doesn't change anything for them.
-- Needed to fix the co-occupants N+1 (unit detail page was doing one
-- get_user_by_id round trip per co-renter, same bug class
-- get_users_by_ids was already built to fix elsewhere) without losing
-- the email column that view actually displays.
-- create or replace can't change a function's return row shape, so the
-- old (id, full_name) signature has to be dropped first.
drop function if exists get_users_by_ids(uuid[]);

create or replace function get_users_by_ids(user_ids_input uuid[])
returns table (id uuid, full_name text, email text)
language sql
security definer
set search_path = public
as $$
  select id, full_name, email from public.users where id = any(user_ids_input)
$$;

grant execute on function get_users_by_ids(uuid[]) to authenticated;
