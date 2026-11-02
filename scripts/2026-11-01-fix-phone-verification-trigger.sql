-- Fixes a real bug found in testing: phone verification silently failed
-- to persist whenever the number being verified differed from whatever
-- was already on file (the exact case the flow exists for).
--
-- Root cause: /api/phone/verify-code sets `phone` and `phone_verified_at`
-- together in one UPDATE (on purpose, per its own comment, to avoid the
-- clear-on-change trigger below invalidating itself). But
-- clear_phone_verification_on_change (2026-10-16-phone-verification.sql)
-- is a BEFORE UPDATE trigger that only compares NEW.phone to OLD.phone —
-- it has no way to tell "the app just verified a new number on purpose"
-- apart from "someone changed the phone column some other way, which
-- should invalidate verification." Since both cases make NEW.phone
-- differ from OLD.phone, the trigger always nulled phone_verified_at
-- back out, overwriting the very timestamp the route had just set in the
-- same statement.
--
-- Fix: also check whether phone_verified_at is itself being changed in
-- the same statement. If the caller explicitly set a new
-- phone_verified_at (the verify-code route's case), trust it and don't
-- clear it. If phone changes and phone_verified_at is left alone (every
-- other path that touches `phone`, e.g. a plain profile edit), still
-- clear it exactly as before — that security behavior is unchanged.
create or replace function public.clear_phone_verification_on_change()
returns trigger as $$
begin
  if NEW.phone is distinct from OLD.phone
     and NEW.phone_verified_at is not distinct from OLD.phone_verified_at then
    NEW.phone_verified_at := null;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;
