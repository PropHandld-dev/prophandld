-- Fixes a real, serious bug confirmed via live testing: pm_members_select's
-- third branch subqueries pm_organization_members FROM pm_organization_members's
-- own SELECT policy, which makes Postgres re-apply this same policy to
-- evaluate the subquery, which re-triggers the subquery, forever --
-- "infinite recursion detected in policy for relation
-- \"pm_organization_members\"", surfaced by PostgREST as a bare 500.
--
-- This 500 hits a query every brand-new landlord's first login runs
-- (src/app/login/page.tsx, checking pm_organization_members for
-- isPmIntent), and a separate bug (app_metadata.role never getting
-- backfilled on a plain password login, fixed in the same commit as this
-- script) turns that single 500 into an infinite bounce between /landlord
-- and /login -- a brand-new landlord who signs up, confirms by entering
-- the email code, then logs in with their password (rather than clicking
-- "Continue to dashboard" on the code-confirmation screen) never reaches
-- their dashboard at all, with no visible error, just a permanently frozen
-- "Confirming your account..." spinner.
--
-- Same shape of problem my_landlord_ids() (below, in
-- 2026-11-12-property-manager.sql) was deliberately written security
-- definer to avoid for this exact table -- that fix just never got applied
-- to this table's own policy on itself. Mirrors that pattern: a definer
-- function that bypasses RLS to do the "which orgs am I an accepted member
-- of" lookup, so the policy no longer queries itself under RLS.
create or replace function public.my_pm_accepted_org_ids()
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
  select array_agg(distinct organization_id)
  from public.pm_organization_members
  where user_id = auth.uid() and status = 'accepted'
$$;

drop policy if exists "pm_members_select" on public.pm_organization_members;
create policy "pm_members_select"
on public.pm_organization_members for select to authenticated
using (
  user_id = auth.uid()
  or organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid())
  or organization_id = any (public.my_pm_accepted_org_ids())
);
