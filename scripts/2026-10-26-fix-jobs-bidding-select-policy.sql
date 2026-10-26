-- Real RLS gap found via the Playwright regression suite: "Contractors can
-- view jobs open for bidding" only checked `status = 'bidding'`, with no
-- check that the viewer is actually a contractor. Supabase gives every
-- signed-in user the same Postgres role (`authenticated`) regardless of
-- app-level role, so that USING clause let ANY logged-in user read ANY
-- job row currently open for bidding, anywhere on the platform, including
-- a renter reading a job on a unit they have no connection to.
--
-- Fix: require the viewer to actually be a contractor in addition to the
-- job being open for bidding. public.users has no role column — role
-- lives in Supabase Auth's app_metadata, read via auth.jwt() — same
-- (auth.jwt() -> 'app_metadata' ->> 'role') = 'contractor' check already
-- proven out in scripts/2026-10-04-rls-and-disputes-fixes.sql for the
-- near-identical "contractors can view photos on jobs open for bidding"
-- policy. This doesn't try to replicate the app's trade/zip matching at
-- the RLS layer — the app's own queries already filter to eligible jobs
-- for the "jobs to bid on" list — it just closes the actual leak: a
-- non-contractor reading rows they have no business seeing.

drop policy if exists "Contractors can view jobs open for bidding" on public.jobs;

create policy "Contractors can view jobs open for bidding" on public.jobs
  for select
  to authenticated
  using (
    status = 'bidding'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'contractor'
  );
