-- Contractor bid submission (src/app/contractor/jobs/[jobId]/bid/page.tsx)
-- writes straight to Supabase with no API route in between, so the
-- client-side ">= $15" check added alongside this migration is the only
-- thing stopping a $1/$2 bid today — easy to bypass by anyone calling the
-- REST API directly. This is the actual enforcement; the client-side
-- check is just the friendly, immediate version of it.
alter table public.bids
  add constraint bids_amount_min check (amount >= 15);
