-- Closes a gap in the self-dealing guard added 2026-10-09
-- (2026-10-09-prevent-linked-profile-self-dealing.sql): that guard only
-- compared a bidding contractor's linked_group_id against the job's
-- LANDLORD's linked_group_id. It never checked the job's RENTER. A tenant
-- who also links a contractor profile could report an issue on their own
-- rented unit, then bid on and win that exact job through their linked
-- contractor profile — getting paid by the landlord to "fix" something on
-- their own apartment, with the same unfair sealed-bid information edge
-- the original guard exists to prevent, just via a different relationship.
--
-- Extends both the bid-insert/update guard and the review guard to also
-- block the job's current primary tenant AND any co-renant on that
-- tenancy, not just the landlord.

create or replace function public.prevent_self_dealing_bid()
returns trigger as $$
declare
  contractor_group uuid;
  landlord_group uuid;
  tenant_group uuid;
begin
  if TG_OP = 'UPDATE' and NEW.status is distinct from 'accepted' then
    return NEW;
  end if;

  select linked_group_id into contractor_group
    from public.users
    where id = NEW.contractor_user_id;

  select u.linked_group_id into landlord_group
    from public.jobs j
    join public.units un on un.id = j.unit_id
    join public.properties p on p.id = un.property_id
    join public.users u on u.id = p.owner_user_id
    where j.id = NEW.job_id;

  if contractor_group is not null and contractor_group = landlord_group then
    raise exception 'A contractor cannot bid on, or be selected for, a job posted by their own linked landlord profile.';
  end if;

  -- Same check against the job's current tenant and any co-renter on that
  -- tenancy — a job's renter_user_id/occupants, not its landlord, is what
  -- matters here.
  select u.linked_group_id into tenant_group
    from public.jobs j
    join public.units un on un.id = j.unit_id
    join public.tenancies t on t.unit_id = un.id and t.ended = false
    join public.users u on u.id = t.renter_user_id
    where j.id = NEW.job_id
    limit 1;

  if contractor_group is not null and contractor_group = tenant_group then
    raise exception 'A contractor cannot bid on, or be selected for, a job on a unit they (or their linked tenant profile) rent.';
  end if;

  if contractor_group is not null and exists (
    select 1
    from public.jobs j
    join public.units un on un.id = j.unit_id
    join public.tenancies t on t.unit_id = un.id and t.ended = false
    join public.tenancy_occupants occ on occ.tenancy_id = t.id
    join public.users u on u.id = occ.renter_user_id
    where j.id = NEW.job_id
      and u.linked_group_id = contractor_group
  ) then
    raise exception 'A contractor cannot bid on, or be selected for, a job on a unit they (or their linked co-renter profile) occupy.';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create or replace function public.prevent_self_dealing_review()
returns trigger as $$
declare
  reviewer_group uuid;
  contractor_group uuid;
begin
  select linked_group_id into reviewer_group from public.users where id = NEW.reviewer_user_id;
  select linked_group_id into contractor_group from public.users where id = NEW.contractor_user_id;

  if reviewer_group is not null and reviewer_group = contractor_group then
    raise exception 'You cannot review your own linked contractor profile.';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

-- Triggers already exist from the 2026-10-09 script and point at these
-- same function names — CREATE OR REPLACE FUNCTION above is sufficient,
-- no need to drop/recreate the triggers themselves.
