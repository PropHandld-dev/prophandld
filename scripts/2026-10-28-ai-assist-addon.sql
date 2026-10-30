-- AI Assist billing add-on (v1, infrastructure only — no AI features wired
-- up yet, see project notes). One row per landlord who's ever started a
-- trial; a separate dedicated Stripe subscription, not an item bolted onto
-- the base plan's subscription, so toggling AI Assist never touches the
-- base plan's billing or webhook handling at all.
--
-- Claim-once by design (see start-trial route): once a landlord starts a
-- trial, trial_started_at never resets, even after cancelling, same
-- philosophy as users.trial_started_at on the base plan.
create table if not exists public.ai_assist_subscriptions (
  landlord_user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_started_at timestamptz not null default now(),
  stripe_subscription_id text,
  stripe_subscription_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_assist_subscriptions enable row level security;
grant select, insert, update, delete on public.ai_assist_subscriptions to service_role;
