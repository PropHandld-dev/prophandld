-- Real RLS gap found via the Playwright regression suite: "Contractors can
-- view jobs open for bidding" only checked `status = 'bidding'`, with no
-- check that the viewer is actually a contractor. Supabase gives every
-- signed-in user the same Postgres role (`authenticated`) regardless of
-- app-level role, so that USING clause let ANY logged-in user read ANY
-- job row currently open for bidding, anywhere on the platform, including
-- a renter reading a job on a unit they have no connection to.
--
-- Fix: require the viewer to actually be a contractor (checked against
-- public.users, same source the app itself treats as the role of record)
-- in addition to the job being open for bidding. This doesn't try to
-- replicate the app's trade/zip matching at the RLS layer — the app's own
-- queries already filter to eligible jobs for the "jobs to bid on" list —
-- it just closes the actual leak: a non-contractor reading rows they have
-- no business seeing.

drop policy if exists "Contractors can view jobs open for bidding" on public.jobs;

create policy "Contractors can view jobs open for bidding" on public.jobs
  for select
  to authenticated
  using (
    status = 'bidding'
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'contractor'
    )
  );
