-- Real root cause found (the earlier version of this script guessed
-- wrong — a linked contractor profile — and the diagnostic query
-- proved that wrong: both push subscriptions on nevinjvt@gmail.com
-- belong to the landlord account itself, no linked profile involved).
--
-- public.users has no role column at all — role only lives in Supabase
-- Auth. The "new job near you" contractor-matching query only ever
-- looks at leftover service_zip/service_categories values on a row,
-- regardless of what role that account currently is. nevinjvt@gmail.com
-- has a stray service_zip from earlier poking at contractor settings,
-- so it kept matching its own jobs. Paired with a code fix
-- (src/app/api/notify/route.ts now excludes the job's own landlord from
-- this match going forward) — this clears the stray data on the
-- existing row so it stops matching immediately, not just for new code.

-- Verify first: confirm this is actually set before clearing it.
select id, email, service_zip, service_categories, service_radius_miles
from public.users
where email = 'nevinjvt@gmail.com';

update public.users
set service_zip = null, service_categories = null
where email = 'nevinjvt@gmail.com';
