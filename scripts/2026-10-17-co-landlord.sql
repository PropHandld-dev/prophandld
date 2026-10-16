-- Co-landlord: a landlord can invite a second real person (business
-- partner, hired property manager) with full shared read/write access to
-- the same portfolio. Modeled on the co-renter feature's shape, but
-- portfolio-wide rather than per-tenancy, with an explicit accept step.
--
-- The real RLS policies on properties/units/tenancies/jobs/bids/
-- rent_payments/compliance_items/documents/maintenance_items/contacts
-- are NOT in this repo's tracked SQL (created directly in the Supabase
-- dashboard before the scripts/ convention started) — every policy below
-- is a brand-new ADDITIVE permissive policy, never a modification of
-- whatever already exists. Postgres ORs multiple permissive policies on
-- the same command together, so this can only grant access, never
-- narrow the primary owner's existing (invisible-to-us) access.
--
-- Billing (landlord_subscriptions) and the unused property_roles scaffold
-- are deliberately untouched. Property hard-delete
-- (api/landlord/properties/[id]/delete) stays primary-only by not adding
-- a policy here at all — that route runs on the service-role client with
-- its own explicit owner_user_id check, unaffected by RLS either way.

create table if not exists public.landlord_co_owners (
  id uuid primary key default gen_random_uuid(),
  primary_landlord_user_id uuid not null references public.users(id),
  co_owner_user_id uuid references public.users(id),
  -- Set when invited by email but the invitee hasn't signed up yet.
  -- Filled in by /api/co-owner/link-invite at signup.
  invited_email text,
  status text not null default 'pending' check (status in ('pending','accepted')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint landlord_co_owners_identity check (co_owner_user_id is not null or invited_email is not null)
);
-- No ON DELETE CASCADE — account/delete/route.ts cleans this up itself,
-- explicit and checked, same as every other table there.

create unique index if not exists idx_landlord_co_owners_primary_coowner
  on public.landlord_co_owners(primary_landlord_user_id, co_owner_user_id)
  where co_owner_user_id is not null;

-- v1 product constraint: one person can be an ACCEPTED co-owner of only
-- one primary landlord at a time. Keeps "whose portfolio does a new
-- property belong to" and notification fan-out unambiguous.
create unique index if not exists idx_landlord_co_owners_one_active_portfolio
  on public.landlord_co_owners(co_owner_user_id)
  where status = 'accepted';

create unique index if not exists idx_landlord_co_owners_invited_email
  on public.landlord_co_owners(primary_landlord_user_id, invited_email)
  where invited_email is not null and co_owner_user_id is null;

grant select, update, delete on public.landlord_co_owners to authenticated;
grant select, insert, update, delete on public.landlord_co_owners to service_role;

-- ============================================================
-- my_landlord_ids(): what I can READ/WRITE — self, plus every primary
-- I'm an accepted co-owner of. Single source of truth for every policy
-- below and for the client-side useLandlordIds() hook.
-- ============================================================
create or replace function public.my_landlord_ids()
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
  select array_agg(id) from (
    select auth.uid() as id
    union
    select primary_landlord_user_id from landlord_co_owners
    where co_owner_user_id = auth.uid() and status = 'accepted'
  ) ids
$$;

grant execute on function public.my_landlord_ids() to authenticated;

-- ============================================================
-- primary_landlord_id(): who a NEW row I create should be attributed
-- to. Self, unless I'm an accepted co-owner, in which case the primary
-- I co-own for. Separate from my_landlord_ids() on purpose: that
-- answers "what can I read", this answers "what should I write" —
-- conflating them invites bugs.
-- ============================================================
create or replace function public.primary_landlord_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select primary_landlord_user_id from landlord_co_owners
     where co_owner_user_id = auth.uid() and status = 'accepted'
     limit 1),
    auth.uid()
  )
$$;

grant execute on function public.primary_landlord_id() to authenticated;

-- ============================================================
-- RLS on landlord_co_owners itself.
-- ============================================================
create policy "co_owners_select_own_rows"
on public.landlord_co_owners for select
to authenticated
using (primary_landlord_user_id = auth.uid() or co_owner_user_id = auth.uid());

-- No INSERT policy at all, deliberately: every row is created by a
-- service-role route (the invite step), never directly by a client —
-- a landlord can't self-grant co-ownership by inserting a row.

-- Accept: the invited co-owner flips their own pending row. No role
-- cross-check needed here (the invite step already verified it).
create policy "co_owner_accepts_own_invite"
on public.landlord_co_owners for update
to authenticated
using (co_owner_user_id = auth.uid() and status = 'pending')
with check (co_owner_user_id = auth.uid() and status = 'accepted');

-- Decline (by the invitee) or remove (by either side, any time): plain
-- client-side delete, mirroring tenancy_occupants' remove flow.
create policy "either_side_can_end_co_ownership"
on public.landlord_co_owners for delete
to authenticated
using (primary_landlord_user_id = auth.uid() or co_owner_user_id = auth.uid());

-- Accepting goes through /api/co-owner/accept (not a bare client-side
-- update) specifically so the primary's email+push notification can be
-- sent in the same request — Postgres can't make outbound HTTP calls to
-- Resend/Twilio/web-push from a trigger, so there's no DB-level way to
-- fire a real notification on this transition. The update policy above
-- still backs that route's write (it runs as the signed-in co-owner via
-- their own session, not the service-role client).

-- ============================================================
-- Additive co-owner policies on every shared table.
-- ============================================================

-- properties: co-owner reads/edits any property in a portfolio they're
-- accepted into. INSERT is scoped to primary_landlord_id(), not
-- my_landlord_ids(), so a co-owner-created property lands in the
-- primary's portfolio, not a competing one of their own.
create policy "co_landlord_select_properties"
on public.properties for select to authenticated
using (owner_user_id = any (my_landlord_ids()));

create policy "co_landlord_update_properties"
on public.properties for update to authenticated
using (owner_user_id = any (my_landlord_ids()));

create policy "co_landlord_insert_properties"
on public.properties for insert to authenticated
with check (owner_user_id = primary_landlord_id());

-- units
create policy "co_landlord_select_units"
on public.units for select to authenticated
using (exists (
  select 1 from properties
  where properties.id = units.property_id
    and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_insert_units"
on public.units for insert to authenticated
with check (exists (
  select 1 from properties
  where properties.id = units.property_id
    and properties.owner_user_id = any (my_landlord_ids())
));

-- tenancies: landlord-facing pages only ever SELECT tenancies directly;
-- creation/ending go through service-role routes, which bypass RLS.
create policy "co_landlord_select_tenancies"
on public.tenancies for select to authenticated
using (exists (
  select 1 from units join properties on properties.id = units.property_id
  where units.id = tenancies.unit_id
    and properties.owner_user_id = any (my_landlord_ids())
));

-- jobs
create policy "co_landlord_select_jobs"
on public.jobs for select to authenticated
using (exists (
  select 1 from units join properties on properties.id = units.property_id
  where units.id = jobs.unit_id
    and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_insert_jobs"
on public.jobs for insert to authenticated
with check (exists (
  select 1 from units join properties on properties.id = units.property_id
  where units.id = jobs.unit_id
    and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_update_jobs"
on public.jobs for update to authenticated
using (exists (
  select 1 from units join properties on properties.id = units.property_id
  where units.id = jobs.unit_id
    and properties.owner_user_id = any (my_landlord_ids())
));

-- bids: landlord only ever reads, and updates to accept a contractor.
create policy "co_landlord_select_bids"
on public.bids for select to authenticated
using (exists (
  select 1 from jobs join units on units.id = jobs.unit_id
  join properties on properties.id = units.property_id
  where jobs.id = bids.job_id
    and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_update_bids"
on public.bids for update to authenticated
using (exists (
  select 1 from jobs join units on units.id = jobs.unit_id
  join properties on properties.id = units.property_id
  where jobs.id = bids.job_id
    and properties.owner_user_id = any (my_landlord_ids())
));

-- rent_payments: landlord selects/updates/deletes (manual corrections);
-- inserts come from Stripe webhooks via the service role, not here.
create policy "co_landlord_select_rent_payments"
on public.rent_payments for select to authenticated
using (exists (
  select 1 from tenancies join units on units.id = tenancies.unit_id
  join properties on properties.id = units.property_id
  where tenancies.id = rent_payments.tenancy_id
    and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_update_rent_payments"
on public.rent_payments for update to authenticated
using (exists (
  select 1 from tenancies join units on units.id = tenancies.unit_id
  join properties on properties.id = units.property_id
  where tenancies.id = rent_payments.tenancy_id
    and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_delete_rent_payments"
on public.rent_payments for delete to authenticated
using (exists (
  select 1 from tenancies join units on units.id = tenancies.unit_id
  join properties on properties.id = units.property_id
  where tenancies.id = rent_payments.tenancy_id
    and properties.owner_user_id = any (my_landlord_ids())
));

-- compliance_items: full CRUD (confirmed in compliance/page.tsx).
create policy "co_landlord_select_compliance_items"
on public.compliance_items for select to authenticated
using (exists (select 1 from properties where properties.id = compliance_items.property_id and properties.owner_user_id = any (my_landlord_ids())));

create policy "co_landlord_insert_compliance_items"
on public.compliance_items for insert to authenticated
with check (exists (select 1 from properties where properties.id = compliance_items.property_id and properties.owner_user_id = any (my_landlord_ids())));

create policy "co_landlord_update_compliance_items"
on public.compliance_items for update to authenticated
using (exists (select 1 from properties where properties.id = compliance_items.property_id and properties.owner_user_id = any (my_landlord_ids())));

create policy "co_landlord_delete_compliance_items"
on public.compliance_items for delete to authenticated
using (exists (select 1 from properties where properties.id = compliance_items.property_id and properties.owner_user_id = any (my_landlord_ids())));

-- documents
create policy "co_landlord_select_documents"
on public.documents for select to authenticated
using (exists (select 1 from properties where properties.id = documents.property_id and properties.owner_user_id = any (my_landlord_ids())));

create policy "co_landlord_insert_documents"
on public.documents for insert to authenticated
with check (exists (select 1 from properties where properties.id = documents.property_id and properties.owner_user_id = any (my_landlord_ids())));

create policy "co_landlord_update_documents"
on public.documents for update to authenticated
using (exists (select 1 from properties where properties.id = documents.property_id and properties.owner_user_id = any (my_landlord_ids())));

create policy "co_landlord_delete_documents"
on public.documents for delete to authenticated
using (exists (select 1 from properties where properties.id = documents.property_id and properties.owner_user_id = any (my_landlord_ids())));

-- maintenance_items: full CRUD (confirmed in systems/page.tsx), joined
-- via unit_id -> units -> properties.
create policy "co_landlord_select_maintenance_items"
on public.maintenance_items for select to authenticated
using (exists (
  select 1 from units join properties on properties.id = units.property_id
  where units.id = maintenance_items.unit_id and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_insert_maintenance_items"
on public.maintenance_items for insert to authenticated
with check (exists (
  select 1 from units join properties on properties.id = units.property_id
  where units.id = maintenance_items.unit_id and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_update_maintenance_items"
on public.maintenance_items for update to authenticated
using (exists (
  select 1 from units join properties on properties.id = units.property_id
  where units.id = maintenance_items.unit_id and properties.owner_user_id = any (my_landlord_ids())
));

create policy "co_landlord_delete_maintenance_items"
on public.maintenance_items for delete to authenticated
using (exists (
  select 1 from units join properties on properties.id = units.property_id
  where units.id = maintenance_items.unit_id and properties.owner_user_id = any (my_landlord_ids())
));

-- contacts (property-level vendor/emergency contact list — distinct from
-- personal_emergency_contacts, which is a per-user table and correctly
-- out of scope for this feature).
create policy "co_landlord_select_contacts"
on public.contacts for select to authenticated
using (exists (select 1 from properties where properties.id = contacts.property_id and properties.owner_user_id = any (my_landlord_ids())));

create policy "co_landlord_insert_contacts"
on public.contacts for insert to authenticated
with check (exists (select 1 from properties where properties.id = contacts.property_id and properties.owner_user_id = any (my_landlord_ids())));

create policy "co_landlord_delete_contacts"
on public.contacts for delete to authenticated
using (exists (select 1 from properties where properties.id = contacts.property_id and properties.owner_user_id = any (my_landlord_ids())));
