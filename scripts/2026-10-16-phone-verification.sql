-- Phone number verification before SMS opt-in. Today a phone number is a
-- plain free-text field, never verified — someone could fat-finger it, or
-- type in someone else's number, and Prophandld would text a stranger.
-- Verification is required specifically when turning SMS on, not at
-- signup for everyone (most accounts never opt into SMS at all, so
-- forcing an OTP step on every signup would be pure friction for them).

alter table public.users
  add column phone_verified_at timestamptz;

-- Changing the phone number always invalidates a prior verification —
-- otherwise someone could verify number A, then quietly swap in number B
-- and keep the "verified" flag from A.
create or replace function public.clear_phone_verification_on_change()
returns trigger as $$
begin
  if NEW.phone is distinct from OLD.phone then
    NEW.phone_verified_at := null;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_clear_phone_verification_on_change on public.users;
create trigger trg_clear_phone_verification_on_change
  before update on public.users
  for each row execute function public.clear_phone_verification_on_change();

-- Short-lived OTP codes. One row per user — a new send overwrites any
-- prior unused code for that user rather than accumulating rows.
create table if not exists public.phone_verification_codes (
  user_id uuid primary key references public.users(id),
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Service-role only — every read/write here happens from
-- /api/phone/send-code and /api/phone/verify-code, both server routes
-- using the admin client. No authenticated-role access needed.
grant select, insert, update, delete on public.phone_verification_codes to service_role;
