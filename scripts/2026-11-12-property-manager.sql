-- Property Manager account type (Joshua's spec, Nov 11 2026).
--
-- Deliberate design choice: this does NOT introduce a new `role` value.
-- A PM Admin or PM Staff member is a plain 'landlord'-role account (same
-- as today, possibly with zero properties of their own) who additionally
-- belongs to a pm_organizations/pm_organization_members row. This avoids
-- touching the dozens of existing `role === 'landlord'` checks across the
-- app (role picker, requireRole, Stripe Connect onboarding, push routing,
-- etc.) for a feature that's fundamentally "more landlord accounts I can
-- act through," not a new kind of user. landlord_co_owners already proved
-- this shape works (an accepted co-owner is just a landlord-role account
-- too) — same idea, extended to many clients instead of one portfolio.
--
-- Mirrors landlord_co_owners.sql's own conventions closely: additive
-- tables, service-role-only inserts (never a bare client-side insert of a
-- relationship that grants access), an accept step the invitee's own RLS
-- policy allows, and the same "one active relationship at a time" rule
-- for unambiguous scope.
--
-- What this does NOT attempt: row-level "sees no financials" enforcement
-- via RLS. pm_organization_members.can_view_financials is checked at the
-- application layer (specific finance-reporting routes/pages), not as a
-- Postgres policy — Postgres RLS is table/row scoped, not "this row but
-- redact this column," and building that properly is a bigger project
-- than this pass. Documented here so it isn't mistaken for a guarantee.

create table if not exists public.pm_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  admin_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

-- v1 constraint: one PM organization per admin — same "keep scope
-- unambiguous" reasoning as landlord_co_owners' one-portfolio-at-a-time
-- rule. A person who wants to run two separate PM companies needs two
-- accounts, same as a landlord who wants two fully separate portfolios
-- today.
create unique index if not exists idx_pm_organizations_one_per_admin
  on public.pm_organizations(admin_user_id);

grant select on public.pm_organizations to authenticated;
grant select, insert, update, delete on public.pm_organizations to service_role;

-- No INSERT/UPDATE policy for authenticated at all: created and renamed
-- only through a service-role route (/api/pm/organizations), same
-- no-self-insert stance as landlord_co_owners.
create policy "pm_org_select_own"
on public.pm_organizations for select to authenticated
using (
  admin_user_id = auth.uid()
  or id in (select organization_id from public.pm_organization_members where user_id = auth.uid() and status = 'accepted')
);

-- ============================================================
-- pm_organization_members: PM Admin (one, the creator) + PM Staff
-- (invited by email, accept required — mirrors landlord_co_owners'
-- invited_email + accept shape exactly).
-- ============================================================
create table if not exists public.pm_organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pm_organizations(id),
  user_id uuid references public.users(id),
  invited_email text,
  member_role text not null default 'staff' check (member_role in ('admin', 'staff')),
  can_view_financials boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint pm_members_identity check (user_id is not null or invited_email is not null)
);

create unique index if not exists idx_pm_members_org_user
  on public.pm_organization_members(organization_id, user_id) where user_id is not null;
create unique index if not exists idx_pm_members_org_email
  on public.pm_organization_members(organization_id, invited_email) where invited_email is not null and user_id is null;
-- One PM org membership (admin or staff) per person at a time — same
-- "unambiguous scope" rule as everywhere else here.
create unique index if not exists idx_pm_members_one_active_org
  on public.pm_organization_members(user_id) where status = 'accepted';

grant select, update, delete on public.pm_organization_members to authenticated;
grant select, insert, update, delete on public.pm_organization_members to service_role;

create policy "pm_members_select"
on public.pm_organization_members for select to authenticated
using (
  user_id = auth.uid()
  or organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid())
  or organization_id in (select organization_id from public.pm_organization_members m2 where m2.user_id = auth.uid() and m2.status = 'accepted')
);

-- Accept own invite: the invitee flips their own pending row.
create policy "pm_member_accepts_own_invite"
on public.pm_organization_members for update to authenticated
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid() and status = 'accepted');

-- Decline (invitee) or remove (admin, any time): plain delete.
create policy "pm_member_or_admin_can_end_membership"
on public.pm_organization_members for delete to authenticated
using (
  user_id = auth.uid()
  or organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid())
);

-- ============================================================
-- pm_client_portfolios: which landlord clients an org manages.
-- ============================================================
create table if not exists public.pm_client_portfolios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pm_organizations(id),
  owner_user_id uuid references public.users(id),
  invited_email text,
  -- Dollar amount, not cents, to match how the rest of this schema
  -- stores money (rent_payments.expected_amount etc. are all numeric
  -- dollars) — kept consistent rather than introducing the one
  -- cents-based money column in the app.
  approval_threshold numeric(10, 2) not null default 500.00,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint pm_portfolio_identity check (owner_user_id is not null or invited_email is not null)
);

create unique index if not exists idx_pm_portfolios_org_owner
  on public.pm_client_portfolios(organization_id, owner_user_id) where owner_user_id is not null;
create unique index if not exists idx_pm_portfolios_org_email
  on public.pm_client_portfolios(organization_id, invited_email) where invited_email is not null and owner_user_id is null;
-- v1: an owner is managed by at most one PM at a time (matches the
-- spec's "their own portfolio only" framing, and the same reasoning as
-- every other "one active relationship" rule in this file).
create unique index if not exists idx_pm_portfolios_one_active_pm
  on public.pm_client_portfolios(owner_user_id) where status = 'accepted';

grant select, update, delete on public.pm_client_portfolios to authenticated;
grant select, insert, update, delete on public.pm_client_portfolios to service_role;

create policy "pm_portfolios_select"
on public.pm_client_portfolios for select to authenticated
using (
  owner_user_id = auth.uid()
  or organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid())
  or organization_id in (select organization_id from public.pm_organization_members where user_id = auth.uid() and status = 'accepted')
);

-- Owner accepts their own invite.
create policy "pm_portfolio_owner_accepts"
on public.pm_client_portfolios for update to authenticated
using (owner_user_id = auth.uid() and status = 'pending')
with check (owner_user_id = auth.uid() and status = 'accepted');

-- Org admin edits the threshold on an already-accepted client.
create policy "pm_portfolio_admin_updates_threshold"
on public.pm_client_portfolios for update to authenticated
using (organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid()));

-- Owner leaves (any time) or org admin removes a client — property data
-- and history are untouched either way; this table is only ever a link.
create policy "pm_portfolio_owner_or_admin_can_end"
on public.pm_client_portfolios for delete to authenticated
using (
  owner_user_id = auth.uid()
  or organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid())
);

-- ============================================================
-- pm_audit_log: every approval-threshold decision, who/what/when/amount
-- — written only by service-role routes (the threshold gate itself),
-- never a direct client insert, so it can't be self-written around.
-- ============================================================
create table if not exists public.pm_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pm_organizations(id),
  owner_user_id uuid not null references public.users(id),
  actor_user_id uuid not null references public.users(id),
  action text not null,
  job_id uuid,
  bid_id uuid,
  amount numeric(10, 2),
  detail text,
  created_at timestamptz not null default now()
);

grant select on public.pm_audit_log to authenticated;
grant select, insert on public.pm_audit_log to service_role;

-- Staff without can_view_financials still shouldn't see dollar amounts
-- here either, consistent with the spec's "sees no financials" tier —
-- enforced the same app-layer way as everywhere else in this file, this
-- policy is read-access-to-the-row, not column-level redaction.
create policy "pm_audit_log_select"
on public.pm_audit_log for select to authenticated
using (
  owner_user_id = auth.uid()
  or organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid())
  or organization_id in (
    select organization_id from public.pm_organization_members
    where user_id = auth.uid() and status = 'accepted' and can_view_financials
  )
);

-- ============================================================
-- The one change that makes all of this actually grant access: every
-- existing policy built on my_landlord_ids() (properties, units, jobs,
-- bids, rent_payments, compliance_items, documents, maintenance_items,
-- contacts — the full co-owner list) now also covers an accepted PM org
-- member, automatically, with zero changes to any of those policies.
-- Extending the shared function is the whole mechanism; nothing else
-- needs to be touched.
-- ============================================================
create or replace function public.my_landlord_ids()
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
  select array_agg(distinct id) from (
    select auth.uid() as id
    union
    select primary_landlord_user_id from landlord_co_owners
    where co_owner_user_id = auth.uid() and status = 'accepted'
    union
    select p.owner_user_id from pm_client_portfolios p
    where p.status = 'accepted'
      and (
        p.organization_id in (select id from pm_organizations where admin_user_id = auth.uid())
        or p.organization_id in (
          select organization_id from pm_organization_members
          where user_id = auth.uid() and status = 'accepted'
        )
      )
  ) ids
$$;

-- primary_landlord_id() (which portfolio a brand-new row I create belongs
-- to) is deliberately NOT extended — it resolves to exactly one id, which
-- doesn't make sense for a PM staff member who may manage several
-- clients at once. v1 scope: PM staff/admin act on an existing client's
-- existing properties/jobs (approve, view, report), not create brand-new
-- properties on a client's behalf — that needs an explicit client
-- picker in the UI, not an implicit single-portfolio default, and is
-- left for a later pass.
