-- Captures interest from the landing page's new "Meet us in person"
-- section ahead of a planned Philadelphia landlord launch event — lets
-- that section go live now, before a date/venue is locked in, and gives
-- a real list to invite once it is. No RLS policy for `authenticated` —
-- only ever touched via /api/event-interest (public insert, service
-- role) and the admin Support page (requireAdminAal2-gated), same
-- pattern as support_escalations.
create table if not exists public.event_interest (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists event_interest_email_idx on public.event_interest (lower(email));
create index if not exists event_interest_created_idx on public.event_interest (created_at desc);

alter table public.event_interest enable row level security;
grant select, insert on public.event_interest to service_role;
