-- Schema for the 4 PM-dashboard follow-ups: staff-level client scoping,
-- a digest notification mode, and public-profile view tracking. The
-- onboarding checklist needs no schema -- it's computed from data that
-- already exists (client count, payout status, open_to_clients).

-- Staff-level client scoping. Defaults preserve today's behavior exactly
-- (every existing member keeps seeing every client) -- this only takes
-- effect once an admin deliberately narrows a specific staff member.
alter table public.pm_organization_members add column if not exists scope_all_clients boolean not null default true;

create table if not exists public.pm_staff_client_access (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.pm_organization_members(id) on delete cascade,
  owner_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists idx_pm_staff_access_member_owner
  on public.pm_staff_client_access(member_id, owner_user_id);

alter table public.pm_staff_client_access enable row level security;
grant select on public.pm_staff_client_access to authenticated;
grant select, insert, update, delete on public.pm_staff_client_access to service_role;

create policy "pm_staff_access_select"
on public.pm_staff_client_access for select to authenticated
using (
  member_id in (select id from public.pm_organization_members where user_id = auth.uid())
  or member_id in (
    select m.id from public.pm_organization_members m
    join public.pm_organizations o on o.id = m.organization_id
    where o.admin_user_id = auth.uid()
  )
);

-- Notification mode: real-time per-event (today's only behavior, kept as
-- the default) or a daily digest instead. Per-member, not per-org -- an
-- admin might want real-time while a staffer managing a big chunk of the
-- portfolio wants one daily summary instead.
alter table public.pm_organization_members add column if not exists notification_mode text not null default 'realtime' check (notification_mode in ('realtime', 'digest'));

-- Public-profile view tracking: one row per view, so it can be counted
-- by any window (today, this month, all-time) without needing a counter
-- column that only ever tracks one running total.
create table if not exists public.pm_profile_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pm_organizations(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index if not exists idx_pm_profile_views_org_time on public.pm_profile_views(organization_id, viewed_at);

alter table public.pm_profile_views enable row level security;
grant select on public.pm_profile_views to authenticated;
grant insert, select on public.pm_profile_views to service_role;

create policy "pm_profile_views_select_own"
on public.pm_profile_views for select to authenticated
using (
  organization_id in (
    select id from public.pm_organizations where admin_user_id = auth.uid()
  )
  or organization_id in (
    select organization_id from public.pm_organization_members where user_id = auth.uid() and status = 'accepted'
  )
);
