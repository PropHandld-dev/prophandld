-- Defense-in-depth for the card-on-file-before-bidding gate: the real
-- enforcement lives in api/landlord/jobs/[jobId]/start-bidding, but that
-- alone can be bypassed by anyone calling Supabase directly instead of
-- going through the app. This rejects the same transition at the
-- database layer too. Optional/separate from the main feature on
-- purpose -- run this once the API-level gate has been live-tested.
create or replace function public.enforce_bidding_requires_payment_method()
returns trigger as $$
declare
  owner_id uuid;
  has_pm boolean;
begin
  if new.status = 'bidding' and (old.status is distinct from 'bidding') then
    select p.owner_user_id into owner_id
    from public.units u
    join public.properties p on p.id = u.property_id
    where u.id = new.unit_id;

    select (default_payment_method_id is not null) into has_pm
    from public.users
    where id = owner_id;

    if not coalesce(has_pm, false) then
      raise exception 'A payment method must be on file before this job can open for bidding';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists bidding_requires_payment_method on public.jobs;
create trigger bidding_requires_payment_method
  before update on public.jobs
  for each row
  execute function public.enforce_bidding_requires_payment_method();
