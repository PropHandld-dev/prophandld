-- Joshua's call: canceling AI Assist mid-period should keep access through
-- what was already paid for, not cut it off immediately — and a landlord
-- who cancels needs to actually be able to restart afterward (start-trial
-- previously treated "has a row at all" as claim-once forever, so a
-- canceled landlord's "Start" click silently did nothing). See
-- cancel/route.ts and start-trial/route.ts.
alter table public.ai_assist_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.ai_assist_subscriptions add column if not exists current_period_end timestamptz;
