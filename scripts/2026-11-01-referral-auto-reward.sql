-- Turns referral rewards from a manual "we'll reach out" into an automatic
-- one: the moment a referred landlord's trial starts for real (crosses 1
-- unit), the referrer's own trial gets extended by 30 days via the
-- existing trial_override_days mechanism (same column /admin/users already
-- uses for manual grants), and they get an email. rewarded_at guards
-- against double-crediting if the trigger logic ever runs twice for the
-- same referral.
alter table public.referrals add column if not exists rewarded_at timestamptz;
