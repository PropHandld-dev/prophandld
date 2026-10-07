-- Run this whole script once in the Supabase SQL editor.
-- Adds Dwolla support for rent's bank-transfer leg, alongside (not instead
-- of) the existing stripe_* columns on rent_payments/users. Debit-card rent
-- and all job/contractor payments keep using stripe_* exactly as today —
-- these new columns are additive only, so nothing that already reads
-- stripe_payment_intent_id / stripe_status / stripe_connect_account_id /
-- stripe_connect_status anywhere in the app needs to change just because
-- these exist.

-- ============================================================
-- 1. rent_payments: Dwolla's own transfer id + status, mirroring how
--    stripe_payment_intent_id/stripe_status already work for this table.
--    Dwolla's Transfers resource only has four states — pending, processed,
--    failed, cancelled (no separate "processing" state the way Stripe has
--    requires_payment -> processing -> succeeded).
-- ============================================================
alter table rent_payments
  add column dwolla_transfer_id text,
  add column dwolla_status text
    check (dwolla_status in ('pending', 'processed', 'failed', 'cancelled')),
  -- Internal bookkeeping only, never shown to the renter (same spirit as
  -- card_surcharge_amount, but that column is a renter-visible surcharge;
  -- this one is purely what Prophandld absorbed on its own books, exactly
  -- like Stripe's ACH fee was absorbed silently before this). Defaults to 0
  -- so nothing downstream breaks if it's left unused.
  add column dwolla_fee_amount numeric(10, 2) default 0;

-- ============================================================
-- 2. users: Dwolla Customer + funding source, mirroring the existing
--    shared stripe_connect_account_id/stripe_connect_status pair that's
--    already used by both landlords (rent) and contractors (jobs),
--    differentiated only by role. Same shape here: one column pair, used
--    by landlords (receive-only Customers, rent) and renters (sending
--    Customers) — contractors never get a Dwolla customer at all, job
--    payouts stay 100% on Stripe Connect.
--    dwolla_customer_type exists because the two roles that DO use Dwolla
--    (landlord vs renter) use genuinely different Dwolla Customer types.
-- ============================================================
alter table users
  add column dwolla_customer_id text,
  add column dwolla_customer_type text
    check (dwolla_customer_type in ('receive-only', 'unverified')),
  -- App-level status, same 3/4-state shape as stripe_connect_status, not a
  -- literal copy of Dwolla's own customer status strings. 'active' means
  -- "has a usable, verified funding source."
  add column dwolla_customer_status text
    check (dwolla_customer_status in ('not_started', 'pending', 'active', 'suspended')),
  add column dwolla_funding_source_id text,
  add column dwolla_funding_source_status text
    check (dwolla_funding_source_status in ('none', 'pending', 'verified', 'removed'));
