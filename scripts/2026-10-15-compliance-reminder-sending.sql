-- Wires actual sending onto the compliance reminder system that already
-- partly existed: compliance_items.reminder_days was already set by the
-- landlord per item (src/app/landlord/properties/[id]/compliance/page.tsx)
-- and already drove the dashboard "Expiring soon" badge via
-- src/lib/complianceStatus.ts — but nothing ever actually emailed, pushed,
-- or texted the landlord automatically. This adds:
--
-- reminder_channels: which channels the landlord wants for this item's
-- automated reminder. Defaults to email+push; SMS is opt-in per item (and
-- still gated by the landlord's own account-level SMS opt-in + a real
-- phone on file, same as every other SMS type in the app).
--
-- last_reminder_status: the compliance status key ('expiring_soon' or
-- 'expired') the cron last actually sent a reminder for. Comparing against
-- the freshly-computed status each run means a reminder fires exactly once
-- per status transition — once when it first crosses into "expiring
-- soon," once more when it actually expires — and resets to null whenever
-- the item is created or renewed (handled in the app, not here), so a
-- renewed item can trigger a fresh reminder next time it approaches expiry.

alter table compliance_items
  add column if not exists reminder_channels text[] default array['email', 'push'],
  add column if not exists last_reminder_status text;
