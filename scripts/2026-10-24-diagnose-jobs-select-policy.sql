-- Diagnostic only — run this and share the output, nothing here writes
-- anything. A regression test confirmed a renter's own Supabase session can
-- SELECT a jobs row for a property they have no tenancy on at all (job
-- d12b292c-24fb-4dcf-b950-63f57f0cc6b8, "8058 Walker Street, Philadelphia",
-- read while signed in as the renter test account, which only has a
-- tenancy at "2230 Logan Circle, Bensalem"). documents and rent_payments
-- were checked the same way and are correctly scoped — this is isolated to
-- the jobs table's SELECT policy.

select
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'jobs'
order by cmd, policyname;
