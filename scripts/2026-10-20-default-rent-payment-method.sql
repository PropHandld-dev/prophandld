-- Lets a renter save a "usual" rent payment method (bank/card/zelle/venmo/
-- cashapp) so the pay modal can pre-highlight it instead of asking from
-- scratch every month. Purely a remembered preference — never used to
-- skip the explicit pay-confirmation step.
alter table public.users add column if not exists default_rent_payment_method text;
