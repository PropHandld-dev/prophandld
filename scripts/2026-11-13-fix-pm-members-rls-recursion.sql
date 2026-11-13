-- Second attempt superseded by this one -- still recursed live after fixing
-- only pm_organization_members' own self-referencing branch. Root cause
-- turned out to be a MUTUAL cycle between two tables' SELECT policies, not
-- a single table referencing itself:
--
--   pm_members_select (on pm_organization_members) has a branch querying
--   pm_organizations ("...in (select id from pm_organizations where
--   admin_user_id = auth.uid())") -- evaluating that subquery requires
--   applying pm_organizations' OWN select policy, pm_org_select_own, which
--   has its own branch querying pm_organization_members right back
--   ("...in (select organization_id from pm_organization_members
--   where ...)") -- which requires applying pm_members_select again. Two
--   tables, each one's policy calling into the other's RLS-protected
--   table, forms the cycle -- Postgres reports it the same way
--   ("infinite recursion detected in policy for relation
--   \"pm_organization_members\"", 42P17) regardless of whether the cycle
--   is a table referencing itself directly or two tables referencing each
--   other.
--
-- Fix: route BOTH cross-referencing lookups through security-definer
-- plpgsql functions (plpgsql specifically because a plain `language sql`
-- function this simple is eligible for planner inlining, which pastes its
-- body into the policy's query plan and erases the security-definer
-- privilege boundary right back into the same cycle -- confirmed live,
-- see this script's prior attempt). Once both lookups bypass RLS
-- internally, neither table's policy ever needs to apply the other
-- table's policy to evaluate itself, and the cycle is broken from both
-- directions at once.
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

create or replace function public.my_pm_admin_org_ids()
returns uuid[]
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result uuid[];
begin
  select array_agg(distinct id) into result
  from public.pm_organizations
  where admin_user_id = auth.uid();
  return result;
end;
$$;

drop policy if exists "pm_members_select" on public.pm_organization_members;
create policy "pm_members_select"
on public.pm_organization_members for select to authenticated
using (
  user_id = auth.uid()
  or organization_id = any (public.my_pm_admin_org_ids())
  or organization_id = any (public.my_pm_accepted_org_ids())
);

drop policy if exists "pm_org_select_own" on public.pm_organizations;
create policy "pm_org_select_own"
on public.pm_organizations for select to authenticated
using (
  admin_user_id = auth.uid()
  or id = any (public.my_pm_accepted_org_ids())
);
