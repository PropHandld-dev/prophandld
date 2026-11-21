-- First-month proration (QA RENT-02: a Nov 6 move-in was billed the full
-- $1,250, due Nov 1). Decided 2026-11-21:
--   * Default: the move-in month is prorated by the day and due on the
--     move-in date. Nov 6 of a 30-day month: $1,250 x 25/30 = $1,041.67.
--   * The landlord can choose "full month" when the lease says so.
--   * Both sides see the math (proration_note).
--   * Calculated here, in the database, in whole cents: whoever creates the
--     row (daily cron, a page load, the landlord), the amount is the same
--     and nobody can send a different one.
--   * Late fees and grace periods count from the real due date (due_date).
-- Run after 2026-11-21-whole-cents.sql.

alter table public.tenancies
  add column if not exists first_month_proration text not null default 'prorate'
  check (first_month_proration in ('prorate', 'full'));

alter table public.tenancy_invites
  add column if not exists first_month_proration text not null default 'prorate'
  check (first_month_proration in ('prorate', 'full'));

alter table public.rent_payments
  add column if not exists due_date date,
  add column if not exists proration_note text;

create or replace function public.rent_payment_first_month()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  month_start date;
  days_in_month int;
  days_owed int;
begin
  select rent_amount, lease_start, first_month_proration, rent_due_day into t
  from tenancies where id = new.tenancy_id;
  if t.lease_start is null or t.rent_amount is null then
    return new;
  end if;

  month_start := date_trunc('month', new.month)::date;

  -- Only the move-in month, and only a row priced at the normal rent (a
  -- landlord who typed a custom amount for that month keeps it).
  if month_start <> date_trunc('month', t.lease_start)::date then
    return new;
  end if;
  if round(coalesce(new.expected_amount, 0), 2) <> round(t.rent_amount, 2) then
    return new;
  end if;

  -- Due on move-in day, unless the normal due day comes later that month.
  new.due_date := greatest(t.lease_start, month_start + (least(coalesce(t.rent_due_day, 1), 28) - 1));

  if t.first_month_proration = 'prorate' and extract(day from t.lease_start) > 1 then
    days_in_month := extract(day from (month_start + interval '1 month - 1 day'))::int;
    days_owed := days_in_month - extract(day from t.lease_start)::int + 1;
    new.expected_amount := round(t.rent_amount * days_owed / days_in_month, 2);
    new.proration_note := format('%s x %s of %s days', to_char(t.rent_amount, 'FM$999,999,990.00'), days_owed, days_in_month);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rent_payment_first_month on public.rent_payments;
create trigger trg_rent_payment_first_month
  before insert on public.rent_payments
  for each row execute function public.rent_payment_first_month();

revoke all on function public.rent_payment_first_month() from public, anon, authenticated;
