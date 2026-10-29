-- Lease renewal/expiration reminders — same shape as the existing
-- compliance-item reminders, applied to tenancies.lease_end, which
-- already existed but had nothing watching it. Claim-once (like
-- disputes.stale_reminder_sent_at), not a repeating/escalating status
-- like compliance_items: one heads-up per tenancy is the right amount of
-- urgency for "your lease ends in ~60 days," not a recurring nag.
alter table public.tenancies add column if not exists renewal_reminder_sent_at timestamptz;
