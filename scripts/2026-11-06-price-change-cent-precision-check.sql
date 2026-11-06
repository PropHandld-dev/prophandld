-- Confirmed bug (external audit, 2026-11-05): labor 280.005 and parts
-- 0.005 both passed straight through to a $280.01 price-change request,
-- stored and displayed as sub-cent amounts (Labor $280.005, Parts
-- $0.005). Neither input actually enforced its step=0.01. Fixed
-- client-side in contractor/jobs/[jobId]/page.tsx (submitPriceChange);
-- this is the real server-side backstop in case that check is ever
-- bypassed. `not valid` so it doesn't fail on any existing sub-cent rows
-- (review and correct those manually first if present).
alter table public.bids
  add constraint bids_price_change_labor_cents
  check (price_change_labor is null or price_change_labor * 100 = round(price_change_labor * 100))
  not valid;

alter table public.bids
  add constraint bids_price_change_parts_cents
  check (price_change_parts is null or price_change_parts * 100 = round(price_change_parts * 100))
  not valid;
