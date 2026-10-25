-- Tracks whether an existing contractor has been emailed about the
-- 2026-10-24 terms update (the "free ... ever" -> pilot-program wording
-- change). Claim-once, same pattern as welcomed_at/trial_started_at —
-- lets the send route be safely re-run without double-emailing anyone.
alter table public.users add column if not exists contractor_terms_pilot_notice_sent_at timestamptz;
