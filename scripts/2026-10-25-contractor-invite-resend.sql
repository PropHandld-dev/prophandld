-- Supports a "Resend" action on a pending contractor invite — tracked
-- separately from created_at so the UI can show "last sent 2 hours ago"
-- and the resend route can enforce a short cooldown against spam-clicking.
alter table public.contractor_invites add column if not exists last_sent_at timestamptz;
update public.contractor_invites set last_sent_at = created_at where last_sent_at is null;
