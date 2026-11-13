-- PM public profiles: lets a property management company opt in to being
-- discoverable inside Prophandld (a browsable directory + their own
-- shareable "shop" page at /property-managers/[slug]), and lets a
-- landlord request to be managed by them directly, the reverse of the
-- existing admin-invites-owner flow. The public-facing reads (directory,
-- profile, reviews) go through service-role API routes, not direct RLS,
-- since pm_organizations' only existing SELECT policy requires
-- auth.uid() to already be an org member -- a logged-out visitor sharing
-- or browsing a profile link has no session at all.

alter table public.pm_organizations add column if not exists slug text unique;
alter table public.pm_organizations add column if not exists open_to_clients boolean not null default false;
alter table public.pm_organizations add column if not exists pitch text;

-- Which side of the relationship started it -- existing rows are all
-- PM-initiated (the only direction that existed before this), so the
-- default backfills correctly with no data migration needed. Matters
-- for which side sees "Accept/Decline" vs. "Waiting for a response."
alter table public.pm_client_portfolios add column if not exists requested_by text not null default 'pm' check (requested_by in ('pm', 'owner'));

-- ============================================================
-- pm_reviews: one review per (org, reviewer), written only by an
-- accepted client of that org -- enforced in the API route, not RLS,
-- same no-self-insert stance as pm_audit_log (no INSERT/UPDATE policy
-- for authenticated at all).
-- ============================================================
create table if not exists public.pm_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pm_organizations(id),
  reviewer_user_id uuid not null references public.users(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_pm_reviews_org_reviewer
  on public.pm_reviews(organization_id, reviewer_user_id);

alter table public.pm_reviews enable row level security;
grant select on public.pm_reviews to authenticated;
grant select, insert, update, delete on public.pm_reviews to service_role;

create policy "pm_reviews_select_all"
on public.pm_reviews for select to authenticated
using (true);
