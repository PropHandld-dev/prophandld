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
-- 3. The tenant's job status showed "Your landlord is handling this
--    themselves" (the DIY-only message) on a job that actually went
--    through normal sealed bidding with a real contractor selected —
--    confirmed in testing, cross-checked against the landlord's own
--    view of the same job showing "Contractor selected" correctly.
--    Root cause: the tenant page checks "does this job have an
--    accepted bid" with a direct SELECT on bids, which is almost
--    certainly blocked by the sealed-bidding RLS policy that (rightly)
--    keeps bid amounts and contractor identity hidden from the tenant
--    until a contractor is actually selected — so the check silently
--    came back empty even when a bid really was accepted. Rather than
--    loosen bids' RLS (which would also let a technically-savvy tenant
--    query bid amounts directly, breaking the sealed-bidding
--    guarantee), this is a boolean-only function: it reveals nothing
--    except yes/no a contractor has been picked for a given job id,
--    the same trust level as get_user_by_id already uses for names.
-- ============================================================
create or replace function job_has_accepted_bid(target_job_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from bids
    where job_id = target_job_id
    and status = 'accepted'
  )
$$;

grant execute on function job_has_accepted_bid(uuid) to authenticated;

-- ============================================================
-- 4. Disputes: raising one has been 500ing every single time in
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
