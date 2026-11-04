-- SECURITY FIX — confirmed live by an external isolation review: a
-- contractor who is NOT the accepted bidder on a job could still read
-- the tenant's access_notes field (e.g. "spare key under the mat," entry
-- instructions) just by loading that job's detail page with a known/
-- guessed job id. The contractor job-detail page fetches the full jobs
-- row via `select('*')` through the browser's own authenticated client,
-- so whatever the jobs table's SELECT policy allows a contractor to see
-- for bidding purposes (category, description, address, etc.) was also
-- handing over access_notes with no additional restriction.
--
-- This function is the actual fix: SECURITY DEFINER means it does its
-- own explicit authorization check — "is this exact caller the accepted
-- bidder on this exact job" — rather than relying on whatever the
-- broader jobs-table RLS policy happens to allow. Narrowly scoped to
-- return ONLY access_notes (null if not authorized), not the whole row,
-- so it can't accidentally widen visibility of anything else. The app
-- now fetches access_notes through this instead of the raw column.
--
-- This closes the exact leak demonstrated. It does not replace a real
-- audit of the underlying jobs-table RLS SELECT policy for contractors —
-- that's still worth reviewing separately, since a sufficiently
-- determined caller hitting the table directly (not through this app's
-- own UI) is only as safe as that policy actually is.
create or replace function public.get_job_access_notes_for_contractor(target_job_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notes text;
  v_is_accepted boolean;
begin
  select exists (
    select 1 from public.bids
    where job_id = target_job_id
      and contractor_user_id = auth.uid()
      and status = 'accepted'
  ) into v_is_accepted;

  if not v_is_accepted then
    return null;
  end if;

  select access_notes into v_notes from public.jobs where id = target_job_id;
  return v_notes;
end;
$$;

grant execute on function public.get_job_access_notes_for_contractor(uuid) to authenticated;
