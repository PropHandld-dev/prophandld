-- TEAM-01, second half: removing a co-owner/manager is ALSO currently
-- broken — CoOwnersSection's handleRemove does a plain client-side DELETE
-- (supabase.from('landlord_co_owners').delete().eq('id', id)), and a live
-- test (real invite -> real accept -> real remove, all through the real
-- app) showed the manager's access fully intact after the delete, with no
-- error surfaced anywhere — the delete matched zero rows because nothing
-- grants the primary landlord DELETE on their own co-owner row.
drop policy if exists primary_deletes_own_co_owner_invite on public.landlord_co_owners;

create policy primary_deletes_own_co_owner_invite
  on public.landlord_co_owners
  for delete
  to authenticated
  using (primary_landlord_user_id = auth.uid());

grant delete on public.landlord_co_owners to authenticated;
