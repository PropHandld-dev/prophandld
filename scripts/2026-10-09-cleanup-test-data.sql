-- Cleanup for the self-dealing-guard test data created during the 2026-10-09
-- multi-role / self-dealing audit. Safe to run as-is; every delete is scoped
-- to the exact rows created for that test.

-- 1. The test job + its bid (job: "Self-dealing guard test job")
delete from public.bids
where job_id = '1713d4c2-e3a0-4208-a17a-efb6c9b66c2f';

delete from public.jobs
where id = '1713d4c2-e3a0-4208-a17a-efb6c9b66c2f';

-- 2. The two linked test profiles created under Nevin's identity to exercise
-- the profile-switch flow (contractor + renter, alongside the real landlord
-- account). public.users rows first (FK references), then the auth.users
-- rows — deleting from auth.users does NOT cascade to public.users here.
delete from public.users
where id in (
  '738b6bb7-bf42-4e4f-adfa-46214d801e87', -- linked contractor test profile
  'e1a4fa69-130d-450b-9045-9b4d67b4b511'  -- linked renter test profile
);

delete from auth.users
where id in (
  '738b6bb7-bf42-4e4f-adfa-46214d801e87',
  'e1a4fa69-130d-450b-9045-9b4d67b4b511'
);
