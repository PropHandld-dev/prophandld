-- How a landlord (or the PM collecting their rent) accepts rent beyond the
-- in-app bank transfer: check by mail, cash in person, and switches to turn
-- the in-app bank or debit-card option off.
alter table public.users add column if not exists rent_check_payable_to text check (rent_check_payable_to is null or char_length(rent_check_payable_to) <= 120);
alter table public.users add column if not exists rent_check_mail_address text check (rent_check_mail_address is null or char_length(rent_check_mail_address) <= 300);
alter table public.users add column if not exists rent_cash_instructions text check (rent_cash_instructions is null or char_length(rent_cash_instructions) <= 300);
alter table public.users add column if not exists rent_accept_bank boolean not null default true;
alter table public.users add column if not exists rent_accept_card boolean not null default true;
