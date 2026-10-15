-- Fixes a real bug: 2026-10-15-document-reminders.sql granted access to
-- `authenticated` (for the user-facing reminder toggle) but never granted
-- `service_role` (what the cron's getSupabaseAdmin() client runs as).
-- Confirmed live: cron/document-reminders failed outright with Postgres
-- 42501 "permission denied for table document_reminders" the first time
-- it ran. RLS being enabled doesn't substitute for this — Postgres still
-- checks table-level GRANTs first, RLS policies second.

grant select, insert, update, delete on document_reminders to service_role;

-- Same bug, same fix, on notification_log — confirmed live: the
-- compliance-reminders cron's notification_log insert failed with the
-- identical 42501 error, silently (the cron's own response still said
-- ok:true, since that insert's error is logged but intentionally doesn't
-- fail the whole request) — so the two reminders it actually sent never
-- got logged for the admin delivery-tracking panel to show.
grant select, insert, update, delete on notification_log to service_role;
