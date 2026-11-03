-- Contractor bid submission (src/app/contractor/jobs/[jobId]/bid/page.tsx)
-- writes straight to Supabase with no API route in between, so the
-- client-side ">= $15" check added alongside this migration is the only
-- thing stopping a $1/$2 bid today — easy to bypass by anyone calling the
-- REST API directly. This is the actual enforcement; the client-side
-- check is just the friendly, immediate version of it.
--
-- NOT VALID: real existing bids (test data from earlier sessions, likely
-- some genuine $1/$2 test bids) are already below $15 — a validating
-- ADD CONSTRAINT would scan and reject the whole migration over rows
-- that already happened and aren't being touched. NOT VALID skips that
-- scan but still enforces the check on every INSERT and every UPDATE
-- that changes amount from this point forward, which is the only thing
-- that actually matters — nothing new can get in under $15 either way.
alter table public.bids
  add constraint bids_amount_min check (amount >= 15) not valid;
