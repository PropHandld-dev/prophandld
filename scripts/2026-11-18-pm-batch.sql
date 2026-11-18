-- PM batch (2026-11-18): ending management cleanly, rent routing to a PM,
-- records ledger, owner<->PM action cards, AI leases, screening requests.
-- Safe to re-run.

-- ---------------------------------------------------------------------
-- 1. Ending a PM relationship
-- ---------------------------------------------------------------------
-- Fee payments used to block removing a PM (FK with no cascade) and would
-- lose their link if it were deleted. Keep them, owned by org + owner.
alter table public.pm_fee_payments add column if not exists organization_id uuid references public.pm_organizations(id);
alter table public.pm_fee_payments add column if not exists owner_user_id uuid references public.users(id);
update public.pm_fee_payments f
set organization_id = p.organization_id, owner_user_id = p.owner_user_id
from public.pm_client_portfolios p
where f.portfolio_id = p.id and (f.organization_id is null or f.owner_user_id is null);
alter table public.pm_fee_payments alter column portfolio_id drop not null;
alter table public.pm_fee_payments drop constraint if exists pm_fee_payments_portfolio_id_fkey;
alter table public.pm_fee_payments
  add constraint pm_fee_payments_portfolio_id_fkey
  foreign key (portfolio_id) references public.pm_client_portfolios(id) on delete set null;

-- A record of every ended relationship: who ended it, why, and what was
-- outstanding at that moment.
create table if not exists public.pm_relationship_endings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pm_organizations(id),
  owner_user_id uuid not null references public.users(id),
  ended_by uuid references public.users(id),
  ended_by_side text not null check (ended_by_side in ('owner', 'pm')),
  reason text,
  note text check (note is null or char_length(note) <= 500),
  deposits_held text check (deposits_held in ('yes', 'no', 'unsure')),
  notified_tenants boolean not null default false,
  open_jobs_count integer not null default 0,
  unpaid_fees_amount numeric(10, 2) not null default 0,
  rent_was_to_pm boolean not null default false,
  managed_since timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pm_relationship_endings_owner_idx on public.pm_relationship_endings(owner_user_id);
create index if not exists pm_relationship_endings_org_idx on public.pm_relationship_endings(organization_id);
alter table public.pm_relationship_endings enable row level security;
revoke all on public.pm_relationship_endings from anon, authenticated;
grant select, insert, update, delete on public.pm_relationship_endings to service_role;

-- ---------------------------------------------------------------------
-- 2. Rent routing: rent to the owner (default) or to the PM
-- ---------------------------------------------------------------------
-- Rent can go to the PM only when the PM has attested a broker license and
-- a trust/escrow account, AND the owner approved. Ending the relationship
-- deletes the portfolio row, so rent goes back to the owner automatically.
alter table public.pm_organizations add column if not exists broker_license_number text;
alter table public.pm_organizations add column if not exists broker_license_state text;
alter table public.pm_organizations add column if not exists trust_account_attested_at timestamptz;
alter table public.pm_organizations add column if not exists trust_account_attested_by uuid references public.users(id);

alter table public.pm_client_portfolios add column if not exists rent_recipient text not null default 'owner';
alter table public.pm_client_portfolios drop constraint if exists pm_client_portfolios_rent_recipient_check;
alter table public.pm_client_portfolios add constraint pm_client_portfolios_rent_recipient_check check (rent_recipient in ('owner', 'pm'));
alter table public.pm_client_portfolios add column if not exists rent_to_pm_requested_at timestamptz;
alter table public.pm_client_portfolios add column if not exists rent_to_pm_requested_by uuid references public.users(id);
alter table public.pm_client_portfolios add column if not exists rent_to_pm_approved_at timestamptz;

-- Which account each rent payment actually went to, for the records ledger.
alter table public.rent_payments add column if not exists paid_to text;
alter table public.rent_payments drop constraint if exists rent_payments_paid_to_check;
alter table public.rent_payments add constraint rent_payments_paid_to_check check (paid_to is null or paid_to in ('owner', 'pm'));
alter table public.rent_payments add column if not exists paid_to_org_id uuid references public.pm_organizations(id);
-- The Stripe account each rent payment was charged on (owner's or PM's),
-- so later lookups and refunds go to the right place.
alter table public.rent_payments add column if not exists stripe_account_id text;

-- ---------------------------------------------------------------------
-- 3. Records ledger: income/expenses entered by hand (anything not paid
--    through Prophandld: insurance, taxes, a contractor paid in cash...).
--    Rent, job payments and PM fees come from their own tables.
-- ---------------------------------------------------------------------
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id),
  property_id uuid references public.properties(id) on delete set null,
  entry_date date not null,
  direction text not null check (direction in ('in', 'out')),
  category text not null check (category in ('rent', 'deposit', 'other_income', 'repair', 'utilities', 'insurance', 'tax', 'mortgage', 'hoa', 'supplies', 'management', 'legal', 'other')),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  description text check (description is null or char_length(description) <= 300),
  vendor text check (vendor is null or char_length(vendor) <= 120),
  document_id uuid references public.documents(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_owner_date_idx on public.ledger_entries(owner_user_id, entry_date);
alter table public.ledger_entries enable row level security;
revoke all on public.ledger_entries from anon, authenticated;
grant select, insert, update, delete on public.ledger_entries to service_role;

-- ---------------------------------------------------------------------
-- 4. PM <-> owner conversation, with approval cards
-- ---------------------------------------------------------------------
-- One conversation per PM company + owner. Read and written only through
-- /api/pm/thread (service role, after membership/ownership checks).
create table if not exists public.pm_owner_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pm_organizations(id),
  owner_user_id uuid not null references public.users(id),
  sender_user_id uuid references public.users(id) on delete set null,
  sender_side text not null check (sender_side in ('owner', 'pm')),
  kind text not null default 'text' check (kind in ('text', 'approval')),
  body text not null check (char_length(body) between 1 and 4000),
  -- For approval cards: { type: 'job_payment' | 'general', bidId?, jobId?, amount?, title }
  action jsonb,
  action_status text check (action_status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pm_owner_messages_pair_idx on public.pm_owner_messages(organization_id, owner_user_id, created_at);
create index if not exists pm_owner_messages_bid_idx on public.pm_owner_messages((action->>'bidId')) where kind = 'approval';
alter table public.pm_owner_messages enable row level security;
revoke all on public.pm_owner_messages from anon, authenticated;
grant select, insert, update, delete on public.pm_owner_messages to service_role;

-- When each side last read the conversation (for unread badges).
create table if not exists public.pm_owner_thread_reads (
  organization_id uuid not null references public.pm_organizations(id),
  owner_user_id uuid not null references public.users(id),
  reader_user_id uuid not null references public.users(id),
  last_read_at timestamptz not null default now(),
  primary key (organization_id, owner_user_id, reader_user_id)
);
alter table public.pm_owner_thread_reads enable row level security;
revoke all on public.pm_owner_thread_reads from anon, authenticated;
grant select, insert, update, delete on public.pm_owner_thread_reads to service_role;

-- ---------------------------------------------------------------------
-- 5. AI lease drafts (Pennsylvania template + AI-written extra terms)
-- ---------------------------------------------------------------------
create table if not exists public.generated_leases (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  owner_user_id uuid not null references public.users(id),
  created_by uuid references public.users(id) on delete set null,
  inputs jsonb not null,
  extra_clauses jsonb not null default '[]'::jsonb,
  review_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists generated_leases_unit_idx on public.generated_leases(unit_id, created_at desc);
alter table public.generated_leases enable row level security;
revoke all on public.generated_leases from anon, authenticated;
grant select, insert, update, delete on public.generated_leases to service_role;

-- ---------------------------------------------------------------------
-- 6. Applicant screening log (reports themselves stay with the screening
--    provider; we only record who was screened and the decision)
-- ---------------------------------------------------------------------
create table if not exists public.screening_requests (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  owner_user_id uuid not null references public.users(id),
  created_by uuid references public.users(id) on delete set null,
  applicant_name text not null check (char_length(applicant_name) between 1 and 120),
  applicant_email text not null check (char_length(applicant_email) <= 200),
  provider text not null default 'smartmove',
  status text not null default 'invited' check (status in ('invited', 'report_received', 'approved', 'declined', 'withdrawn')),
  note text check (note is null or char_length(note) <= 500),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists screening_requests_unit_idx on public.screening_requests(unit_id, created_at desc);
alter table public.screening_requests enable row level security;
revoke all on public.screening_requests from anon, authenticated;
grant select, insert, update, delete on public.screening_requests to service_role;
