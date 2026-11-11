-- One-time, optional: every current Stripe Connect account is a test-mode
-- account with no real landlord/contractor depending on it, so instead of
-- building a permanent dual Express/Standard migration path, just clear
-- the stored account id and let the next "set up payouts" click create a
-- fresh Standard-equivalent one (see the new connect/onboard/route.ts).
-- Only run this once the onboarding route itself has actually shipped the
-- controller-based account creation -- running it before that would just
-- recreate Express accounts again.
update public.users
set stripe_connect_account_id = null,
    stripe_connect_status = null
where stripe_connect_account_id is not null;
