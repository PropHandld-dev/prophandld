-- Two independent additions to the PM feature set:
--
-- 1. Fee model expansion + recurring billing bookkeeping. Today a PM can
--    only charge a flat dollar amount, and "monthly" is just a label --
--    nothing ever auto-charges it, the owner has to remember to click
--    "Pay now" every cycle. This adds a percent-of-rent-collected option
--    (the dominant real-world PM fee model -- flat-fee-only is a genuine
--    competitive gap against Buildium/AppFolio/DoorLoop) and a column the
--    new cron/pm-fee-billing job uses to bill each portfolio at most once
--    per calendar month. Still a direct Stripe charge straight to the PM's
--    own Connect account either way -- Prophandld never custodies this
--    money, same as the existing flat-fee flow.
-- 2. Trust-building public profile fields -- research across real PM
--    software (Buildium/AppFolio/DoorLoop) and what landlords say they
--    check before trusting a PM consistently surfaces license/insurance,
--    service area, track record, and specialties as the actual
--    trust-gates, not just a one-line pitch and a star rating (all this
--    profile currently has).

alter table public.pm_client_portfolios add column if not exists management_fee_type text not null default 'flat'
  check (management_fee_type in ('flat', 'percent_of_rent'));
alter table public.pm_client_portfolios add column if not exists management_fee_percent numeric(5, 2);
-- 'YYYY-MM' -- the idempotency key cron/pm-fee-billing claims before
-- attempting a charge, same "claim via conditional update" shape as
-- cron/unpaid-job-reminder's autocharge_attempted_at, just per-cycle
-- instead of once-ever since this fee recurs.
alter table public.pm_client_portfolios add column if not exists last_fee_billed_month text;

alter table public.pm_organizations add column if not exists license_number text;
alter table public.pm_organizations add column if not exists insured boolean not null default false;
alter table public.pm_organizations add column if not exists years_in_business int;
alter table public.pm_organizations add column if not exists specialties text[];
alter table public.pm_organizations add column if not exists service_zips text[];
-- Free-text, PM-controlled, intentionally not derived from any specific
-- client's actual fee row (that's private to each relationship) --
-- research flagged opaque pricing as a real dealbreaker for a landlord
-- comparison-shopping PMs, so this is a marketing-facing "what to expect"
-- line, e.g. "8-10% of monthly rent" or "$150/unit/month".
alter table public.pm_organizations add column if not exists pricing_note text;
