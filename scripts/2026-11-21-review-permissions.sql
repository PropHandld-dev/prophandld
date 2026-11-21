-- "Could not save review: new row violates row-level security policy for
-- table contractor_reviews". The existing insert rule only knew the
-- property's own owner (and the tenant); a property manager or co-owner
-- acting for that owner was refused, even though the app (Today list, job
-- page) offers them "Rate the contractor".
--
-- This adds a second, additional rule (Postgres ORs permissive policies,
-- so nothing the old rule allowed changes). It only allows a review when:
--   * you are the reviewer on the row,
--   * the job is finished (completed or archived),
--   * the contractor on the row is the one whose bid was accepted for that
--     job (no reviewing someone who didn't do the work), and
--   * you can act for the property's owner: the owner, an accepted
--     co-owner, an accepted member of a PM company managing them, or a
--     tenant/co-tenant on that unit.

create or replace function public.can_review_job(p_job_id uuid, p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs j
    join units u on u.id = j.unit_id
    join properties pr on pr.id = u.property_id
    where j.id = p_job_id
      and j.status in ('completed', 'archived')
      and exists (select 1 from bids b where b.job_id = j.id and b.status = 'accepted' and b.contractor_user_id = p_contractor_id)
      and (
        pr.owner_user_id = auth.uid()
        or exists (select 1 from landlord_co_owners c where c.primary_landlord_user_id = pr.owner_user_id and c.co_owner_user_id = auth.uid() and c.status = 'accepted')
        or exists (
          select 1 from pm_organization_members m
          join pm_client_portfolios p on p.organization_id = m.organization_id and p.status = 'accepted'
          where m.user_id = auth.uid() and m.status = 'accepted' and p.owner_user_id = pr.owner_user_id
        )
        or exists (select 1 from tenancies t where t.unit_id = u.id and t.renter_user_id = auth.uid())
        or exists (select 1 from tenancy_occupants o join tenancies t on t.id = o.tenancy_id where t.unit_id = u.id and o.renter_user_id = auth.uid())
      )
  )
$$;

revoke all on function public.can_review_job(uuid, uuid) from public, anon;
grant execute on function public.can_review_job(uuid, uuid) to authenticated;

drop policy if exists "Reviewers acting for the owner can add reviews" on public.contractor_reviews;
create policy "Reviewers acting for the owner can add reviews"
  on public.contractor_reviews
  for insert
  to authenticated
  with check (reviewer_user_id = auth.uid() and public.can_review_job(job_id, contractor_user_id));
