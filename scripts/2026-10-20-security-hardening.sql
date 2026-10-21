-- Security hardening pass (full account/API/RLS audit, 2026-10-20).
--
-- 1) CRITICAL FIX: landlord_co_owners' own "accept your invite" RLS policy
--    (co_owner_accepts_own_invite, in 2026-10-17-co-landlord.sql) checks
--    that co_owner_user_id and status are correct on both the before- and
--    after-update row, but never constrains primary_landlord_user_id —
--    which a client-side UPDATE is otherwise free to change in the same
--    statement. Concretely: anyone who holds ANY pending co-owner invite
--    under their own user id (trivial to obtain — invite one of your own
--    second accounts from a throwaway landlord account) can directly
--    UPDATE that row's primary_landlord_user_id to an arbitrary victim
--    landlord's user id while flipping status to 'accepted' in the same
--    call. Both USING and WITH CHECK pass (neither clause touches that
--    column), and my_landlord_ids() — which every co-landlord SELECT/
--    UPDATE policy on properties/units/tenancies/jobs/bids/rent_payments/
--    compliance_items/documents/maintenance_items/contacts is built on —
--    would then treat the attacker as a full co-owner of the victim's
--    entire portfolio. RLS policies can't compare a column's old value to
--    its new value directly (WITH CHECK only ever sees the proposed new
--    row), so this needs a trigger: reject any UPDATE that tries to
--    change primary_landlord_user_id at all, for every row, regardless of
--    which role is doing the updating. No legitimate flow in the app
--    (service-role or client) ever changes this column after insert, so
--    this can't break anything working today.
create or replace function public.lock_co_owner_primary_landlord()
returns trigger
language plpgsql
as $$
begin
  if new.primary_landlord_user_id is distinct from old.primary_landlord_user_id then
    raise exception 'landlord_co_owners.primary_landlord_user_id cannot be changed after the row is created';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_co_owner_primary_landlord on public.landlord_co_owners;
create trigger trg_lock_co_owner_primary_landlord
  before update on public.landlord_co_owners
  for each row execute function public.lock_co_owner_primary_landlord();

-- 2) disputes: has `grant select, insert, update, delete on disputes to
--    service_role, authenticated` (2026-10-04-rls-and-disputes-fixes.sql)
--    but no tracked RLS policy anywhere — src/app/admin/disputes/page.tsx
--    even says in its own comment "RLS is the real backstop" for its
--    direct client-side `supabase.from('disputes').select('*')` call. If
--    RLS isn't already enabled on this table at the (untracked, pre-dates-
--    this-repo) baseline, that GRANT alone means any authenticated user —
--    landlord, renter, or contractor — could read or write every dispute
--    in the system directly from a browser console, not just their own.
--    Every actual write already goes through service-role API routes
--    (api/disputes/raise, api/disputes/resolve) with their own ownership
--    checks, and the only direct client reads in the app are the two
--    admin pages (admin/page.tsx, admin/disputes/page.tsx) — so admin-only
--    is the correct, narrowest policy; nothing else needs authenticated-
--    role access to this table at all.
alter table public.disputes enable row level security;

drop policy if exists "Admins can read disputes" on public.disputes;
create policy "Admins can read disputes"
  on public.disputes for select
  using (exists (select 1 from admin_users where user_id = auth.uid()));

-- 3) phone_verification_codes: holds live OTP codes + phone numbers but
--    was only ever granted to service_role (2026-10-16-phone-verification.sql),
--    never `authenticated` — so it's already inaccessible via PostgREST
--    today. It has no RLS enabled, though, so it has no backstop if an
--    `authenticated` grant is ever added later (e.g. a copy-paste mistake
--    from a similar table). Enabling RLS with zero policies for
--    `authenticated` makes that a safe no-op instead of an OTP-reading
--    account-takeover bug; service_role bypasses RLS entirely either way,
--    so this changes nothing for the two routes that actually use it.
alter table public.phone_verification_codes enable row level security;

-- 4) Terms-acceptance evidence gap (legal audit): the signup checkbox only
--    ever blocked the client-side form submit — nothing durable recorded
--    THAT a given user agreed, or to which version of the role-specific
--    terms. See src/app/signup/page.tsx's TERMS_VERSION constant and the
--    write right after signUp() succeeds.
alter table public.users add column if not exists terms_accepted_at timestamptz;
alter table public.users add column if not exists terms_version text;

-- Writing these two columns via a plain client-side `.update()` (as
-- signup/page.tsx first did) has a real evidentiary weakness: the
-- timestamp comes from the CALLER'S OWN clock, and a user's own session
-- is allowed to update their own row — so a technical user could, in
-- principle, call this with a backdated timestamp, or call it again later
-- with a different one, undermining the exact thing this record exists to
-- prove. This function closes both gaps: `now()` is the database
-- server's own clock (not client-suppliable), `security definer` +
-- `auth.uid()` means a caller can only ever stamp their own row, and
-- `coalesce` makes it write-once — once set, calling it again can't
-- change the recorded date or version, even from the same account.
create or replace function public.record_terms_acceptance(version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set terms_accepted_at = coalesce(terms_accepted_at, now()),
      terms_version = coalesce(terms_version, version)
  where id = auth.uid();
end;
$$;

grant execute on function public.record_terms_acceptance(text) to authenticated;
