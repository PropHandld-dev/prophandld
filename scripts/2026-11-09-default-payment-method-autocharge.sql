-- Requires a landlord to have a payment method on file before a job can
-- open for bidding, and lets cron/unpaid-job-reminder actually attempt an
-- off-session charge after 3 days unpaid instead of only emailing. See
-- src/lib/defaultPaymentMethod.ts for how these columns get written.
alter table public.users add column if not exists default_payment_method_id text;
alter table public.users add column if not exists default_payment_method_type text; -- 'card' | 'us_bank_account'
alter table public.users add column if not exists default_payment_method_label text; -- "Visa •••• 4242", display only
alter table public.users add column if not exists default_payment_method_set_at timestamptz;

alter table public.jobs add column if not exists autocharge_attempted_at timestamptz;
alter table public.jobs add column if not exists autocharge_result text; -- 'succeeded' | 'requires_action' | 'declined'
