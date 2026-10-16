-- Supports closing the free-tier loophole Joshua flagged: nothing today
-- stops one person from signing up as a landlord 5 separate times (5
-- different emails) and adding one property to each account, staying free
-- on all 5 instead of paying for a real 5-unit account. tierForUnitCount()
-- counts units per account, with no cross-account identity check at all.
--
-- payout_bank_fingerprint backs the Stripe Connect side of the fix: Stripe
-- gives every linked bank account a `fingerprint` that's the same across
-- Connect accounts if it's genuinely the same real bank account (see
-- account.updated in webhooks/stripe/route.ts). Two "different" landlord
-- accounts whose payout bank resolves to the same fingerprint is exactly
-- the signal this loophole produces, caught after the fact (Stripe's own
-- hosted onboarding collects the bank details directly, never through our
-- server, so this can only be checked once Stripe tells us about it).
--
-- The signup-time phone check (see /api/signup/check-landlord-phone) reads
-- the existing users.phone column directly — no schema change needed for
-- that half.

alter table users
  add column payout_bank_fingerprint text;
