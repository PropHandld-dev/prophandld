-- PAY-10: a job approved (manually or via the 3-day auto-approve cron) with
-- its contractor still unpaid had no follow-up at all beyond the single
-- notification sent at approval time. This column lets a new daily cron
-- (cron/unpaid-job-reminder) gate a repeating reminder so it fires roughly
-- once a day until the landlord actually pays, instead of relying on one
-- easy-to-miss email.
alter table public.jobs add column if not exists unpaid_reminder_last_sent_at timestamptz;
