-- Extends the existing daily sms-health-check cron (which already fetches
-- each SMS's full Twilio status to check for registration errors) to also
-- persist the actual delivery status — today it only reads message.status
-- in memory to decide on an admin alert and then discards it. This column
-- is what gives a real, queryable history of delivered vs undelivered vs
-- still-pending, the exact "examples or patterns" Twilio's support asked
-- for after finding some of Nevin's sampled messages stuck at 1003
-- ACCEPTED instead of 1004 DELIVERED.
alter table public.notification_log add column if not exists delivery_status text;
alter table public.notification_log add column if not exists delivery_checked_at timestamptz;
