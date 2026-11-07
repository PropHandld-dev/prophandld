-- TEAM-01 root cause: accepting a co-owner invite is currently broken.
-- /api/co-owner/accept does a plain client-side UPDATE (by design — see
-- its own comment, so the primary's notification email can fire in the
-- same request) relying entirely on an RLS policy to let the invitee
-- accept their own row. A live test (real invite -> real accept, both
-- through the actual app) returned "Could not accept the invite" because
-- the update matched zero rows. Recreating the policy explicitly, since
-- whatever is there now either doesn't exist or doesn't match on the
-- right column.
drop policy if exists co_owner_accepts_own_invite on public.landlord_co_owners;

create policy co_owner_accepts_own_invite
  on public.landlord_co_owners
  for update
  to authenticated
  using (co_owner_user_id = auth.uid() and status = 'pending')
  with check (co_owner_user_id = auth.uid());

-- Defensive, in case the earlier RLS gotcha (table-level grant missing
-- alongside the policy) is what's actually at play here too.
grant update on public.landlord_co_owners to authenticated;

-- Cleanup: an orphaned accepted row from earlier test setup points at a
-- different, no-longer-used "Nevin Jaison" user id (not the real
-- nevinjvt@gmail.com account), which is what made TEAM-01's re-audit see
-- "Managing for Nevin Jaison" on Jack's side with nothing to match on
-- Nevin's own Co-owners list. Safe to remove now that a fresh, correct
-- invite exists between the real accounts.
delete from public.landlord_co_owners where id = '3d5450ac-3f38-48e3-b427-6b6bd77a850d';

