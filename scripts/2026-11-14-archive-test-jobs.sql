-- Cleans up leftover test/QA job rows that have been sitting in production,
-- visible on a real contractor's "Available jobs near you" feed
-- (src/app/api/contractor/available-jobs/route.ts, which only filters on
-- status = 'bidding' -- it has no idea these are test rows). Found live:
-- titles like "QA TEST -- do not treat as real", "CLAUDE TEST: ...",
-- "ADVERSARIAL TEST: ...", "SEC-TEST: ...", "SQL-fix verification: ...",
-- at fake sequential addresses like "800 Test QA St".
--
-- Archiving, not deleting -- same precedent as
-- 2026-10-23-qa-test-data-cleanup.sql's own choice for a job that was
-- already archived through the app's UI: zero FK risk (no dependent
-- bids/messages/photos/disputes rows need touching), fully reversible,
-- and matches the app's own intended job lifecycle (the "Archive" button
-- on a real job does exactly this). This also matches how the
-- contractor's available-jobs feed is actually filtered: it only ever
-- shows status = 'bidding', so archiving removes it from that feed
-- immediately, with no other side effect.

-- ============================================================
-- STEP 1 -- REVIEW ONLY. Run this first and look at what it returns
-- before running STEP 2. Expect only obvious test/QA rows here -- if
-- anything in the list looks like a real job, stop and tell me which
-- row, don't run STEP 2.
-- ============================================================
select
  j.id,
  j.category,
  j.description,
  j.status,
  j.created_at,
  p.address,
  p.city
from jobs j
join units u on u.id = j.unit_id
join properties p on p.id = u.property_id
where
  j.description ilike '%QA TEST%'
  or j.description ilike '%do not treat as real%'
  or j.description ilike '%CLAUDE TEST%'
  or j.description ilike '%ADVERSARIAL TEST%'
  or j.description ilike '%SEC-TEST%'
  or j.description ilike '%SQL-fix%'
  or j.description ilike '%Post-SQL-fix%'
  or j.description ilike '%stale-reschedule%'
  or j.description ilike '%Launch-QA%'
  or j.description ilike '%bid flow%test%'
  or j.description ilike '%please ignore/delete%'
  or j.description ilike '%please ignore%test only%'
  or j.description ilike '%PM-NOTIFY-TEST%'
  or j.description ilike '%QA-TURNOVER%'
  or j.description ilike '%TEST ONLY%'
  or p.address ilike '%Test QA St%'
order by j.created_at desc;

-- ============================================================
-- STEP 2 -- Only after STEP 1's list looks right. Archives (not
-- deletes) every matching row -- exact same WHERE clause as STEP 1,
-- so if STEP 1 looked correct, this affects exactly those rows and
-- nothing else.
-- ============================================================
-- update jobs set status = 'archived'
-- where id in (
--   select j.id
--   from jobs j
--   join units u on u.id = j.unit_id
--   join properties p on p.id = u.property_id
--   where
--     j.description ilike '%QA TEST%'
--     or j.description ilike '%do not treat as real%'
--     or j.description ilike '%CLAUDE TEST%'
--     or j.description ilike '%ADVERSARIAL TEST%'
--     or j.description ilike '%SEC-TEST%'
--     or j.description ilike '%SQL-fix%'
--     or j.description ilike '%Post-SQL-fix%'
--     or j.description ilike '%stale-reschedule%'
--     or j.description ilike '%Launch-QA%'
--     or j.description ilike '%bid flow%test%'
--     or j.description ilike '%please ignore/delete%'
--     or j.description ilike '%please ignore%test only%'
--     or j.description ilike '%PM-NOTIFY-TEST%'
--     or j.description ilike '%QA-TURNOVER%'
--     or j.description ilike '%TEST ONLY%'
--     or p.address ilike '%Test QA St%'
-- );
