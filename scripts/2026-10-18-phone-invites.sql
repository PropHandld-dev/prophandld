-- Full phone parity with email across every invite flow.
--
-- get_user_id_by_phone matches on last-10-digits of both sides, not a raw
-- string — users.phone isn't stored in one consistent format (whatever the
-- person originally typed), so a raw comparison would silently miss real
-- matches. role_input matters because, unlike email, phone is legitimately
-- shared across a person's own linked profiles (landlord-you and
-- renter-you, same human, same number) — no unique constraint on phone is
-- added or needed; this filter is what correctly picks the right account,
-- the same way every email-invite route already separately checks role
-- after the fact. limit 1: two unrelated real people coincidentally
-- sharing a number is a rare, low-stakes edge case, accepted as-is.
create or replace function public.get_user_id_by_phone(phone_input text, role_input text)
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select pu.id
  from public.users pu
  join auth.users au on au.id = pu.id
  where pu.phone is not null
    and right(regexp_replace(pu.phone, '\D', '', 'g'), 10) = right(regexp_replace(phone_input, '\D', '', 'g'), 10)
    and au.raw_app_meta_data->>'role' = role_input
  limit 1
$$;

grant execute on function public.get_user_id_by_phone(text, text) to authenticated;

-- Pending no-account-yet invites tracked by phone, mirroring each table's
-- existing email column. Nullable — an invite is by email or by phone, not
-- both. co-renter invites need no equivalent: that flow already has no
-- persistent invite row for the no-account case (just fires an email),
-- so its phone variant mirrors that same shape with nothing to persist.
alter table public.landlord_co_owners add column if not exists invited_phone text;
alter table public.contractor_invites add column if not exists invited_phone text;
alter table public.tenancy_invites add column if not exists renter_phone text;

create index if not exists idx_landlord_co_owners_invited_phone
  on public.landlord_co_owners(invited_phone)
  where invited_phone is not null and co_owner_user_id is null;

create index if not exists idx_contractor_invites_invited_phone
  on public.contractor_invites(invited_phone)
  where invited_phone is not null and status = 'pending';

create index if not exists idx_tenancy_invites_renter_phone
  on public.tenancy_invites(renter_phone)
  where renter_phone is not null and status = 'pending';

-- contractor_invites.contractor_email and tenancy_invites.renter_email were
-- both NOT NULL (every existing code path always provided one) — a
-- phone-only invite needs to be able to leave them null. Safe to run
-- whether or not the constraint is already gone.
alter table public.contractor_invites alter column contractor_email drop not null;
alter table public.tenancy_invites alter column renter_email drop not null;

-- landlord_co_owners' own identity check only ever allowed invited_email
-- as the no-account-yet identifier — widen it to also accept invited_phone.
alter table public.landlord_co_owners drop constraint if exists landlord_co_owners_identity;
alter table public.landlord_co_owners add constraint landlord_co_owners_identity
  check (co_owner_user_id is not null or invited_email is not null or invited_phone is not null);
