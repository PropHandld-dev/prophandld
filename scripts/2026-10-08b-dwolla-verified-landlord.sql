-- Run this whole script once in the Supabase SQL editor.
-- Landlords were going to be Dwolla Receive-Only Customers (lightest KYC,
-- no SSN/DOB/address) since they only ever receive rent — but Dwolla's
-- transfer rules turned out to block an Unverified sender (the renter)
-- from reaching a Receive-Only recipient at all, confirmed against a real
-- sandbox transfer attempt ("Receiver cannot receive from sender").
-- Landlords become Verified Customers instead — the fix is entirely in
-- the app code; this just widens the check constraint to allow it.

alter table users drop constraint if exists users_dwolla_customer_type_check;
alter table users
  add constraint users_dwolla_customer_type_check
  check (dwolla_customer_type in ('receive-only', 'unverified', 'verified'));
