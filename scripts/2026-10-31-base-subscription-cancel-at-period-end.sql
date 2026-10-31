-- The base landlord subscription is managed entirely through Stripe's
-- hosted billing portal (stripe/billing-portal/route.ts), which already
-- handles the actual cancel-at-period-end mechanics on Stripe's side (same
-- underlying Stripe behavior AI Assist's own cancel route now uses
-- deliberately). But this app never tracked cancel_at_period_end or
-- current_period_end for the base plan at all, so a landlord who cancels
-- via the portal sees no sign of it anywhere in the app itself — just
-- "Active" right up until the day it silently isn't. Mirrors
-- scripts/2026-10-30-ai-assist-cancel-at-period-end.sql exactly.
alter table public.landlord_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.landlord_subscriptions add column if not exists current_period_end timestamptz;
