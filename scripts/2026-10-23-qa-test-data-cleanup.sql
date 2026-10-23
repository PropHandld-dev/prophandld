-- Cleanup for test data left behind by the 2026-10-23 manual QA pass on
-- Bindu's unit (2230 Logan Circle, Unit Main). Run each numbered section
-- top to bottom — every destructive step has a SELECT right above it to
-- confirm you're about to touch exactly the rows described, nothing else.

-- =====================================================================
-- 1. March 2026 rent payment: Mark Received was tested live, which
--    flipped a real "Late" test fixture to "Paid $2,500". No UI path
--    reverts a Stripe-guarded paid month, so reverting it here just
--    undoes those two fields — same shape as before the test.
-- =====================================================================

-- Verify first: should return exactly one row, March 2026, actual_amount 2500.
select id, month, actual_amount, paid_date, payment_method
from rent_payments
where tenancy_id = (
  select id from tenancies where unit_id = 'c72658fc-c242-4c25-a06a-9a824000b8e6' order by created_at desc limit 1
)
and month = '2026-03-01';

update rent_payments
set actual_amount = 0, paid_date = null
where tenancy_id = (
  select id from tenancies where unit_id = 'c72658fc-c242-4c25-a06a-9a824000b8e6' order by created_at desc limit 1
)
and month = '2026-03-01';

-- =====================================================================
-- 2. January 2027: a throwaway month I added purely to test the payment
--    flow (a real $1.33 Stripe test-mode charge, no real money). This
--    row didn't exist before the test, so it's a straight delete, not a
--    revert. The UI's "can't delete a paid-online month" guard is
--    client-side only — doesn't apply here.
-- =====================================================================

-- Verify first: should return exactly one row, January 2027, $1 expected / $1.33 paid.
select id, month, expected_amount, actual_amount
from rent_payments
where tenancy_id = (
  select id from tenancies where unit_id = 'c72658fc-c242-4c25-a06a-9a824000b8e6' order by created_at desc limit 1
)
and month = '2027-01-01';

delete from rent_payments
where tenancy_id = (
  select id from tenancies where unit_id = 'c72658fc-c242-4c25-a06a-9a824000b8e6' order by created_at desc limit 1
)
and month = '2027-01-01';

-- =====================================================================
-- 3. Two test photos uploaded to the move-in inspection on 2026-10-23
--    (a 1x1 pixel PNG, twice) — there's no delete control in the
--    inspection UI at all, so this is the only way to remove them.
--    Deletes both the row and the underlying storage object.
-- =====================================================================

-- Verify first: should return exactly 2 rows, both created 2026-10-23.
select id, photo_url, created_at
from inspection_photos
where inspection_id = (
  select id from move_in_inspections
  where tenancy_id = (select id from tenancies where unit_id = 'c72658fc-c242-4c25-a06a-9a824000b8e6' order by created_at desc limit 1)
  and type = 'move_in'
  order by created_at desc
  limit 1
)
and created_at >= '2026-10-23' and created_at < '2026-10-24';

delete from storage.objects
where bucket_id = 'inspection-photos'
and name in (
  select photo_url from inspection_photos
  where inspection_id = (
    select id from move_in_inspections
    where tenancy_id = (select id from tenancies where unit_id = 'c72658fc-c242-4c25-a06a-9a824000b8e6' order by created_at desc limit 1)
    and type = 'move_in'
    order by created_at desc
    limit 1
  )
  and created_at >= '2026-10-23' and created_at < '2026-10-24'
);

delete from inspection_photos
where inspection_id = (
  select id from move_in_inspections
  where tenancy_id = (select id from tenancies where unit_id = 'c72658fc-c242-4c25-a06a-9a824000b8e6' order by created_at desc limit 1)
  and type = 'move_in'
  order by created_at desc
  limit 1
)
and created_at >= '2026-10-23' and created_at < '2026-10-24';

-- =====================================================================
-- 4. The end-to-end test job itself ("Leaky Faucet or Pipe",
--    QA-LOOP-TEST marker) was already archived live through the app's
--    own Archive button, not deleted — the safer, intended way to park
--    a real completed job (bid, payment, chat history, photos all stay
--    linked and consistent). No SQL needed for it.
-- =====================================================================

-- =====================================================================
-- 5. READ-ONLY: which accounts actually used "Add Landlord/Renter/
--    Contractor" before it was hidden. A normal account's linked_group_id
--    just points to its own id (set by the one-time backfill) — only a
--    group_id shared by 2+ rows means someone actually linked a second
--    profile. Run this and decide case by case; nothing here deletes
--    anything. The alias accounts this feature creates follow the
--    pattern original+role@domain.com (e.g. joshuawilson4477+landlord@
--    gmail.com), so you'll likely recognize which groups are real
--    testing you and Joshua did versus anyone else.
-- =====================================================================

select
  u.linked_group_id,
  count(*) as profile_count,
  array_agg(u.email order by u.created_at) as emails,
  array_agg(u.id order by u.created_at) as user_ids
from public.users u
where u.linked_group_id is not null
group by u.linked_group_id
having count(*) > 1
order by profile_count desc;
