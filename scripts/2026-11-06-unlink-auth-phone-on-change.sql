-- Companion fix for phone-number login (added alongside it,
-- api/phone/verify-code now links a freshly-verified number onto
-- auth.users.phone so signInWithPassword({ phone, password }) works).
--
-- clear_phone_verification_on_change already nulls public.users'
-- own phone_verified_at whenever `phone` changes outside the
-- verify-code route (a plain profile edit, not a re-verification). But
-- it never touched auth.users.phone, which is the actual login
-- credential now that phone-login exists — left alone, a landlord who
-- edits their phone number on the profile page would keep their OLD
-- number working as a login phone indefinitely, pointing at an account
-- it may no longer actually belong to. Same trigger, same condition,
-- now also clears the auth-side link in that case. The verify-code
-- route's own UPDATE (phone + phone_verified_at together) still isn't
-- affected, same as before — this only fires when phone_verified_at is
-- NOT being set in the same statement.
create or replace function public.clear_phone_verification_on_change()
returns trigger as $$
begin
  if NEW.phone is distinct from OLD.phone
     and NEW.phone_verified_at is not distinct from OLD.phone_verified_at then
    NEW.phone_verified_at := null;
    update auth.users set phone = null where id = NEW.id and phone is not null;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;
