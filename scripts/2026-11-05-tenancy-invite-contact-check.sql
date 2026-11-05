-- Confirmed bug (external audit, 2026-11-05): "Link renter" could be
-- submitted completely blank and still showed "Invite sent", leaving a
-- permanent pending invitation with no recipient to cancel out of. Fixed
-- client-side in tenancy/new/page.tsx; this is the real server-side
-- backstop in case that check is ever bypassed. `not valid` so it doesn't
-- fail on any existing blank-recipient rows (cancel/delete those manually
-- first if present).
alter table public.tenancy_invites
  add constraint tenancy_invites_has_contact
  check (
    (renter_email is not null and btrim(renter_email) <> '')
    or (renter_phone is not null and btrim(renter_phone) <> '')
  )
  not valid;
