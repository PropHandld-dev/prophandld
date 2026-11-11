-- Rent-payment rebuild, step 1: schema for the payment-provider abstraction
-- and the fee-absorption feature-flag system. See the plan this came
-- from for the full design (Standard Connect accounts, direct charges,
-- controller.fees.payer for fee absorption, Stripe now / Dwolla later).

-- Provider abstraction -- every payment/payment-method row records which
-- provider actually processed it. Historical rows default 'stripe' and
-- are never rewritten; this only matters going forward once (if ever) a
-- second provider exists.
alter table public.rent_payments add column if not exists provider text not null default 'stripe';
alter table public.rent_payments add column if not exists absorbed_fee_amount numeric;
alter table public.users add column if not exists ach_provider text not null default 'stripe';

-- Feature flags -- a few named global settings, not a speculative general
-- framework. value holds {enabled, expires_at?, min_tier?} per flag.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('ach_fee_absorption', '{"enabled": false}'::jsonb),
  ('card_surcharge', '{"enabled": false}'::jsonb),
  ('ach_flat_fee_fallback', '{"enabled": false, "amount": 1.5}'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
grant select on public.app_settings to authenticated;
grant select, insert, update on public.app_settings to service_role;

-- Per-landlord override for ach_fee_absorption specifically -- null defers
-- to the global app_settings flag, true/false forces it regardless.
alter table public.users add column if not exists ach_fee_absorption_override boolean;
