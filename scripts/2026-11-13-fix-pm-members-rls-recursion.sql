-- Fixes a real, serious bug confirmed via live testing: pm_members_select's
-- third branch subqueries pm_organization_members FROM pm_organization_members's
-- own SELECT policy, which makes Postgres re-apply this same policy to
-- evaluate the subquery, which re-triggers the subquery, forever --
-- "infinite recursion detected in policy for relation
-- \"pm_organization_members\"" (Postgres error 42P17), surfaced by
-- PostgREST as a bare 500.
--
-- This 500 hits a query every brand-new landlord's first login runs
-- (src/app/login/page.tsx, checking pm_organization_members for
-- isPmIntent), and a separate bug (app_metadata.role never getting
-- backfilled on a plain password login, fixed in a prior commit) turned
-- that single 500 into an infinite bounce between /landlord and /login --
-- a brand-new landlord who signs up, confirms by entering the email code,
-- then logs in with their password never reached their dashboard at all,
-- with no visible error, just a permanently frozen "Confirming your
-- account..." spinner.
--
-- A first attempt at this fix (wrapping the self-lookup in a `security
-- definer` SQL function) still recursed. Root cause of THAT: a plain
-- `language sql` function this simple is eligible for inlining -- Postgres
-- can paste its body directly into the policy's query plan, which erases
-- the security-definer privilege boundary for RLS purposes within that one
-- plan and reintroduces the exact same self-referencing subquery, right
-- back to square one. `language plpgsql` is never inlined by the planner,
-- which is what actually makes the security-definer boundary hold here.
create or replace function public.my_pm_accepted_org_ids()
returns uuid[]
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result uuid[];
begin
  select array_agg(distinct organization_id) into result
  from public.pm_organization_members
  where user_id = auth.uid() and status = 'accepted';
  return result;
end;
$$;

drop policy if exists "pm_members_select" on public.pm_organization_members;
create policy "pm_members_select"
on public.pm_organization_members for select to authenticated
using (
  user_id = auth.uid()
  or organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid())
  or organization_id = any (public.my_pm_accepted_org_ids())
);
