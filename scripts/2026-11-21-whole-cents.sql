-- Money is whole cents everywhere (QA RENT-03, RENT-05, SEC-04, REPORT-01/03).
-- A manual payment of $100.005 and a $0.004 water bill were saved as-is, and
-- every report built on them disagreed with itself by a cent. The app now
-- rejects fractional cents; this rounds what's already stored and makes the
-- database refuse them too (the ledger's manual-payment and add-month writes
-- go straight to the table).

update public.rent_payments set actual_amount = round(actual_amount, 2) where actual_amount is not null and actual_amount <> round(actual_amount, 2);
update public.rent_payments set expected_amount = round(expected_amount, 2) where expected_amount is not null and expected_amount <> round(expected_amount, 2);
update public.rent_payments set utilities_amount = round(utilities_amount, 2) where utilities_amount is not null and utilities_amount <> round(utilities_amount, 2);
update public.rent_payments set water_amount = round(water_amount, 2) where water_amount is not null and water_amount <> round(water_amount, 2);
update public.rent_utility_charges set amount = round(amount, 2) where amount <> round(amount, 2);

alter table public.rent_payments
  add constraint rent_payments_actual_whole_cents check (actual_amount is null or (actual_amount >= 0 and actual_amount = round(actual_amount, 2))),
  add constraint rent_payments_expected_whole_cents check (expected_amount is null or (expected_amount >= 0 and expected_amount = round(expected_amount, 2))),
  add constraint rent_payments_utilities_whole_cents check (utilities_amount is null or utilities_amount = round(utilities_amount, 2));

alter table public.rent_utility_charges
  add constraint rent_utility_charges_whole_cents check (amount >= 0 and amount = round(amount, 2));
