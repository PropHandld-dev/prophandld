-- Rent-rebuild step 6: Dwolla adapter + Plaid bank-linking layer.
-- All additive, `if not exists` throughout -- safe to run even if the
-- earlier abandoned 2026-10-08-dwolla-rent-columns.sql script was already
-- run against this database (it used bare `add column`, no guard, so this
-- one re-states the same columns defensively rather than assuming).

-- ============================================================
-- Dwolla: rent_payments gets Dwolla's own transfer id + status, mirroring
-- stripe_payment_intent_id/stripe_status. Dwolla's Transfers resource has
-- only 4 states (no separate "processing" the way Stripe does).
-- ============================================================
alter table public.rent_payments add column if not exists dwolla_transfer_id text;
alter table public.rent_payments add column if not exists dwolla_status text
  check (dwolla_status in ('pending', 'processed', 'failed', 'cancelled'));

-- users: Dwolla Customer + funding source, mirroring the existing shared
-- stripe_connect_account_id/stripe_connect_status pair. Landlords get
-- receive-only Customers (rent payouts only); renters get unverified
-- Customers whose funding source is verified instantly because Dwolla
-- pulls the account/routing numbers straight from the Plaid exchange,
-- not through Dwolla's own slower IAV/micro-deposit flow.
alter table public.users add column if not exists dwolla_customer_id text;
alter table public.users add column if not exists dwolla_customer_type text
  check (dwolla_customer_type in ('receive-only', 'unverified'));
alter table public.users add column if not exists dwolla_customer_status text
  check (dwolla_customer_status in ('not_started', 'pending', 'active', 'suspended'));
alter table public.users add column if not exists dwolla_funding_source_id text;
alter table public.users add column if not exists dwolla_funding_source_status text
  check (dwolla_funding_source_status in ('none', 'pending', 'verified', 'removed'));

-- ============================================================
-- Plaid: one Item (bank login session) per user who has linked a bank for
-- rent. access_token is the only secret here -- treat it like an API key,
-- never expose it to the client. account_id is the specific account
-- within that Item the user picked to pay/receive with (an Item can cover
-- multiple accounts at one bank).
-- ============================================================
alter table public.users add column if not exists plaid_item_id text;
alter table public.users add column if not exists plaid_access_token text;
alter table public.users add column if not exists plaid_account_id text;
