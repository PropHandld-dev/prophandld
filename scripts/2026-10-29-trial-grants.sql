-- Lets admin staff manually grant a custom trial length or permanent free
-- access, for the base plan and separately for AI Assist, instead of the
-- fixed 14-day trial everyone else gets. See /admin/users ("Trial & AI
-- Assist" action) and src/app/api/admin/trial-grant/route.ts.
--
-- trial_override_days, when set, replaces the global TRIAL_DAYS /
-- AI_ASSIST_TRIAL_DAYS constant for that one landlord — granting always
-- also restamps trial_started_at to now(), so "give them 30 days" means
-- 30 days starting today, not confusing math on an old clock.
-- free_forever bypasses billing entirely regardless of unit count or
-- subscription state; no Stripe subscription is ever required for it.
alter table public.users add column if not exists trial_override_days integer;
alter table public.users add column if not exists free_forever boolean not null default false;

alter table public.ai_assist_subscriptions add column if not exists trial_override_days integer;
alter table public.ai_assist_subscriptions add column if not exists free_forever boolean not null default false;
