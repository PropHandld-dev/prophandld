-- SECURITY: found by the 2026-11-21 attack test, using a contractor's own
-- signed-in session against the database API directly (not the app):
--   1. A contractor could change their accepted bid's amount (e.g. $270 ->
--      $99,999), and the landlord's payment is built from that amount.
--   2. A contractor could mark their own bid "paid".
--   3. A contractor could mark their own job completed and "approved by the
--      landlord", which starts the payment clock and, after 3 days, the
--      automatic charge to the landlord's saved card.
--   4. A contractor could insert a bid on an open job that was already
--      "accepted" and "paid", skipping the landlord's choice.
-- All test changes were reverted. The app's own screens never do any of
-- this; these rules make the database refuse it from anywhere a browser
-- can reach. Server routes (service role, cron, webhooks) are unaffected:
-- they run without a signed-in user (auth.uid() is null).

-- ---------- bids ----------
create or replace function public.guard_bid_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  caller_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  contractor_editable text[] := array['proposed_amount', 'price_change_status', 'price_change_labor', 'price_change_parts', 'price_change_reason', 'updated_at'];
begin
  -- Only changes made directly from a signed-in browser session are
  -- limited. Server routes (service role), cron jobs, webhooks and the
  -- app's own trusted database functions run as other roles.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Every new bid starts as a pending, unpaid offer. (The app submits bids
    -- through a server route; nothing in a browser needs anything else.)
    if new.status is distinct from 'pending'
       or coalesce(new.payment_status, 'unpaid') <> 'unpaid'
       or new.paid_at is not null
       or new.stripe_payment_intent_id is not null then
      raise exception 'New bids start as pending and unpaid' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Payment facts only ever come from Stripe, through the server.
  if new.payment_status is distinct from old.payment_status
     or new.paid_at is distinct from old.paid_at
     or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.card_surcharge_amount is distinct from old.card_surcharge_amount
     or new.job_id is distinct from old.job_id
     or new.contractor_user_id is distinct from old.contractor_user_id then
    raise exception 'Payment details can only be changed by the payment system' using errcode = '42501';
  end if;

  if caller_role = 'contractor' then
    -- A contractor may only ask for a price change, never set the price.
    if (to_jsonb(new) - contractor_editable) is distinct from (to_jsonb(old) - contractor_editable) then
      raise exception 'Contractors can only request a price change' using errcode = '42501';
    end if;
    if new.price_change_status is distinct from old.price_change_status and new.price_change_status <> 'pending' then
      raise exception 'Only the landlord can approve or reject a price change' using errcode = '42501';
    end if;
  else
    -- Landlord side: the amount only changes by approving the contractor's
    -- own requested price, never to an arbitrary number.
    if new.amount is distinct from old.amount
       and not (old.price_change_status = 'pending' and new.price_change_status = 'approved' and new.amount = old.proposed_amount) then
      raise exception 'The price only changes by approving the contractor''s request' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_bid_writes on public.bids;
create trigger trg_guard_bid_writes
  before insert or update on public.bids
  for each row execute function public.guard_bid_writes();

-- ---------- jobs ----------
create or replace function public.guard_job_contractor_updates()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  caller_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  contractor_editable text[] := array['proposed_date', 'proposed_window', 'proposed_time', 'proposed_by', 'schedule_confirmed', 'schedule_ask_tenant', 'status', 'updated_at'];
begin
  if current_user <> 'authenticated' or caller_role <> 'contractor' then
    return new; -- landlords keep their own rules; server routes are unaffected
  end if;

  -- Contractors only handle scheduling and starting the work. Finishing
  -- goes through the server (photos required), and approval is the
  -- landlord's alone.
  if (to_jsonb(new) - contractor_editable) is distinct from (to_jsonb(old) - contractor_editable) then
    raise exception 'Contractors can only update scheduling on a job' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('bid_selected', 'scheduled') and new.status in ('scheduled', 'in_progress')) then
    raise exception 'That status change isn''t allowed for a contractor' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_job_contractor_updates on public.jobs;
create trigger trg_guard_job_contractor_updates
  before update on public.jobs
  for each row execute function public.guard_job_contractor_updates();

-- ---------- users (each person's own account row) ----------
-- Also found by the attack test: anyone signed in could edit sensitive
-- fields on their own row directly: their Stripe payout account or Zelle
-- handle (skipping the password re-check, 48-hour freeze and alert that
-- protect payouts), free-trial days, the fee-absorption setting, and the
-- email address notices go to. From a browser, only these settings may
-- change now; everything else goes through the app's server routes.
create or replace function public.guard_user_self_updates()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  editable text[] := array[
    'full_name', 'phone', 'preferred_language',
    'sms_opt_in', 'email_notifications_enabled', 'push_notifications_enabled',
    'default_rent_payment_method', 'property_tour_seen', 'tour_opt_out',
    'service_categories', 'service_zip', 'service_radius_miles', 'licensed', 'notify_all_categories',
    'phone_verified_at', 'updated_at'
  ];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'That account setting can only be changed from its own screen' using errcode = '42501';
  end if;
  -- A phone change clears verification (another trigger does that); nobody
  -- can mark their own phone verified from a browser.
  if new.phone_verified_at is distinct from old.phone_verified_at and new.phone_verified_at is not null then
    raise exception 'Phone verification happens by text code' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_user_self_updates on public.users;
create trigger trg_guard_user_self_updates
  before update on public.users
  for each row execute function public.guard_user_self_updates();
