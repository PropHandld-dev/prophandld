-- PAY-03 fix: job payment receipts always showed a generic "Card or bank
-- transfer" regardless of which was actually used, because bids never
-- recorded it (rent_payments already has this column and uses it correctly).
alter table public.bids add column if not exists payment_method text;
