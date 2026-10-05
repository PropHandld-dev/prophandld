-- Run this whole script once in the Supabase SQL editor.
-- Fixes two confirmed bugs from today's agent-run testing.

-- ============================================================
-- 1. Landlord-direct job creation was completely broken: creating a
--    job straight from a unit page (no tenant report involved) failed
--    every time with "new row violates row-level security policy for
--    table jobs" (confirmed via the actual network response, not a
--    guess). The existing INSERT policy on jobs was almost certainly
--    written with only the tenant-reports-an-issue case in mind.
--    Postgres OR's permissive policies together, so this just adds
--    the missing case — it doesn't touch or need to know the existing
--    policy at all.
-- ============================================================
create policy "landlords can insert jobs on their own units"
on jobs for insert
to authenticated
with check (
  exists (
    select 1
    from units
    join properties on properties.id = units.property_id
    where units.id = jobs.unit_id
      and properties.owner_user_id = auth.uid()
  )
);

-- ============================================================
-- 2. Same exact failure shape on compliance tracking: adding a
--    compliance item (rental license, lead cert, inspection, etc.)
--    failed with the identical RLS error. Same fix shape.
-- ============================================================
create policy "landlords can insert compliance items on their own properties"
on compliance_items for insert
to authenticated
with check (
  exists (
    select 1
    from properties
    where properties.id = compliance_items.property_id
      and properties.owner_user_id = auth.uid()
  )
);

-- ============================================================
-- 3. Disputes: raising one has been 500ing every single time in
--    testing. /api/disputes/raise uses the service-role client (not
--    a user session), so this is NOT an RLS gap like the two above —
--    something is rejecting the insert at the database level itself,
--    and the route was swallowing the real error. A code change
--    (already pushed) now returns the real Postgres error in the API
--    response so this can be diagnosed directly. Once you see that
--    error, paste it back and the real fix (most likely a check
--    constraint or a NOT NULL column with no default on the disputes
--    table) can be written precisely instead of guessed at here.
-- ============================================================
