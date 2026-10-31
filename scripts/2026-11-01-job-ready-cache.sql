-- Caches the AI "ready to bid" check for an already-posted job, so a
-- landlord's jobs list can show a small flag without re-calling Claude on
-- every page load. Computed once per job, not re-checked automatically if
-- the description changes later (same soft-advisory tradeoff as the
-- check already used at post time).
alter table public.jobs add column if not exists ai_ready_flag boolean;
alter table public.jobs add column if not exists ai_ready_suggestion text;
alter table public.jobs add column if not exists ai_ready_checked_at timestamptz;
