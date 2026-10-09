-- Closes the conflict-of-interest the multi-role linking feature opened:
-- without this, a landlord who also links a contractor profile could bid
-- on their own posted job through it — and since sealed bidding means a
-- contractor never sees competing bids, their own linked contractor would
-- have a real, unfair information edge no other contractor could ever
-- have. This is enforced as a trigger, independent of the existing RLS
-- policies on bids (both the client-side bid form and the landlord's
-- "select this contractor" action write directly via the Supabase client,
-- not through an API route) — a BEFORE trigger blocks it at the database
-- regardless of which path an insert/update comes through.
--
-- Covers both directions: submitting a bid (INSERT) and a landlord
-- selecting one (UPDATE ... status = 'accepted') — the UPDATE check is a
-- backstop in case a bid predates its contractor's landlord profile being
-- linked, not the primary defense; the INSERT check is what actually
-- matters day to day.

create or replace function public.prevent_self_dealing_bid()
returns trigger as $$
declare
  contractor_group uuid;
  landlord_group uuid;
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

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_self_dealing_bid_insert on public.bids;
create trigger trg_prevent_self_dealing_bid_insert
  before insert on public.bids
  for each row execute function public.prevent_self_dealing_bid();

drop trigger if exists trg_prevent_self_dealing_bid_update on public.bids;
create trigger trg_prevent_self_dealing_bid_update
  before update on public.bids
  for each row execute function public.prevent_self_dealing_bid();

-- The same self-dealing shape applies to reviews: a landlord or renter
-- leaving a review for their own linked contractor profile. Lower stakes
-- than the bidding case (a rating is softer signal than a sealed-bid
-- price edge) but the same principle, so it gets the same kind of guard.
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

drop trigger if exists trg_prevent_self_dealing_review on public.contractor_reviews;
create trigger trg_prevent_self_dealing_review
  before insert or update on public.contractor_reviews
  for each row execute function public.prevent_self_dealing_review();
