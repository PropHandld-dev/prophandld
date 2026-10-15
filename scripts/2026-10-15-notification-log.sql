-- Lets admin see whether a compliance reminder actually reached the
-- landlord, not just that the cron attempted it. Stores the provider's
-- own id for each send (Resend's email id, Twilio's message SID) so the
-- admin view can query real delivery status live from Resend/Twilio at
-- read time, rather than trying to maintain our own delivery-status
-- mirror via webhooks. Push has no reliable "opened" signal (service
-- workers don't consistently report this), so push rows are logged as
-- sent-only, by design, not a gap to fix later.
--
-- Generic enough to extend to other notification types later (document
-- reminders, etc.) — resource_type/resource_id identify what triggered
-- the send without a hard foreign key to any one table.

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null, -- e.g. 'compliance_reminder'
  channel text not null check (channel in ('email', 'push', 'sms')),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  external_id text, -- Resend email id or Twilio message SID; null for push
  resource_type text, -- e.g. 'compliance_item'
  resource_id uuid,
  sent_at timestamptz not null default now()
);

create index if not exists notification_log_recipient_idx on notification_log (recipient_user_id, sent_at desc);
create index if not exists notification_log_type_idx on notification_log (notification_type, sent_at desc);

alter table notification_log enable row level security;

-- Admin-only read (matches the existing admin_users-gated pattern used
-- elsewhere); nothing in the app writes this from a user-facing client,
-- only server-side crons/routes via the service role, so no insert
-- policy is needed for normal users.
create policy "Admins can read notification log"
  on notification_log for select
  using (exists (select 1 from admin_users where user_id = auth.uid()));
