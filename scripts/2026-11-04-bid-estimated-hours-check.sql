-- Caught live by an external audit: the hourly bid form let 0 or negative
-- estimated hours reach Step 2 and Submit (client-side validation gap,
-- now fixed in the bid form). Real server-side enforcement so a direct
-- write can't bypass it either.
alter table public.bids
  add constraint bids_estimated_hours_positive
  check (estimated_hours is null or estimated_hours > 0)
  not valid;
