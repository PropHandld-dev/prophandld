-- Fixes a real bug found in testing: creating a new tenancy by email has
-- no role check at all, unlike every other email-based link flow
-- (co-renter/add, co-owner/invite, invite-contractor all check the
-- resolved account's role server-side and reject a mismatch). The
-- tenancy/new page is a pure client-side insert with no server route
-- backing it, so it has no way to check auth.users.raw_app_meta_data
-- itself — it needs the role filter done inside the function, the same
-- way get_user_id_by_phone(phone_input, role_input) already does.
--
-- Adding this as a second, 2-argument overload rather than changing the
-- existing 1-argument get_user_id_by_email(text) — invite-contractor,
-- co-owner/invite, and co-renter/add all still call the 1-argument form
-- and do their own role check afterward; this doesn't touch any of them.
-- Mirrors get_user_id_by_phone's join shape: match on public.users (the
-- same table every other part of the app treats as the source of truth
-- for a user's own email), pull role from auth.users' app metadata.
create or replace function public.get_user_id_by_email(email_input text, role_input text)
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select pu.id
  from public.users pu
  join auth.users au on au.id = pu.id
  where lower(pu.email) = lower(email_input)
    and au.raw_app_meta_data->>'role' = role_input
  limit 1
$$;

grant execute on function public.get_user_id_by_email(text, text) to authenticated;
