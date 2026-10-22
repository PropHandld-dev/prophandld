-- Fixes a real bug in yesterday's disputes RLS policy (confirmed live:
-- /admin/disputes showed "Could not load disputes" for an actual admin).
--
-- The policy's `using (exists (select 1 from admin_users where user_id =
-- auth.uid()))` runs as the QUERYING role (the signed-in admin), and
-- admin_users has RLS enabled with zero policies defined for that role
-- (see adminAccess.ts's own comment: "RLS on that table has no policies
-- at all... only ever readable/writable through the service role") — so
-- the subquery itself gets blocked by admin_users' OWN RLS, and the
-- disputes policy always evaluates to false, even for a real admin. The
-- exact same pattern exists in notification_log's policy
-- (2026-10-15-notification-log.sql) but nothing in the app ever actually
-- queries that table client-side (only via the service-role admin
-- client), so it's been silently broken and unnoticed rather than
-- actively failing like disputes did.
--
-- Fix: a security-definer function runs as its OWNER, not the caller —
-- which bypasses admin_users' RLS the same way the service-role client
-- already does in isAdminUserId(), instead of hitting it as the caller.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admin_users where user_id = auth.uid())
$$;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins can read disputes" on public.disputes;
create policy "Admins can read disputes"
  on public.disputes for select
  using (public.is_admin());

drop policy if exists "Admins can read notification log" on public.notification_log;
create policy "Admins can read notification log"
  on public.notification_log for select
  using (public.is_admin());
