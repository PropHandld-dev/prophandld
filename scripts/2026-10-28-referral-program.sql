-- Referral tracking v1. Deliberately scoped to tracking only, not an
-- automated reward: billing enforcement is still off and Stripe is still
-- test-mode (see billing_enforcement_timing/stripe_payments project
-- notes), so there's no live subscription to apply a credit against yet.
-- This captures every referral now so nothing is lost once a real reward
-- mechanism gets built later — rewards are applied manually for now.
--
-- No separate referral_code column: the referrer's own user id doubles as
-- their code (?ref=<their-user-id> on the signup link), one less thing to
-- generate/collide-check for a v1.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (referred_user_id)
);
alter table public.referrals enable row level security;
grant select, insert, update, delete on public.referrals to service_role;

create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id);
