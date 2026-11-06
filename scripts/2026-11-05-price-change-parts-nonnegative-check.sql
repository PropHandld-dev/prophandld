-- Confirmed bug (external audit, 2026-11-05): a contractor's price-change
-- request accepted labor $280 + parts -$10 = $270 and submitted it, since
-- the client only checked that the SUM was positive. Fixed client-side in
-- contractor/jobs/[jobId]/page.tsx (submitPriceChange); this is the real
-- server-side backstop in case that check is ever bypassed. `not valid` so
-- it doesn't fail on any existing negative-parts rows (review and correct
-- those manually first if present).
alter table public.bids
  add constraint bids_price_change_parts_nonnegative
  check (price_change_parts is null or price_change_parts >= 0)
  not valid;

alter table public.bids
  add constraint bids_price_change_labor_positive
  check (price_change_labor is null or price_change_labor > 0)
  not valid;
