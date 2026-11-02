-- The AI troubleshooting feature (TroubleshootAssistant.tsx) can fully
-- resolve a renter's issue with zero landlord involvement — that's the
-- whole point of it. But when that happens, nothing is written anywhere:
-- no job row, no log, no record of any kind. The landlord, who is the one
-- actually paying for Prophandld AI, has no way to ever see this happened
-- once, let alone how often. A feature that works perfectly but leaves no
-- trace can't justify its own subscription cost to the person paying for
-- it — this table exists specifically to fix that.
--
-- Deliberately NOT a jobs row: nothing happened here that a contractor
-- ever needs to act on or that belongs in the job lifecycle/pipeline —
-- this is purely a landlord-facing value-proof record.
create table if not exists public.ai_troubleshoot_resolutions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  renter_user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_troubleshoot_resolutions_property_id_idx on public.ai_troubleshoot_resolutions(property_id);

alter table public.ai_troubleshoot_resolutions enable row level security;

-- Landlord (or accepted co-owner, via my_landlord_ids()) can read their
-- own properties' rows — this is purely a read-facing dashboard stat for
-- them, never written to from their side.
create policy "landlord_select_own_ai_resolutions" on public.ai_troubleshoot_resolutions
  for select
  using (property_id in (select id from public.properties where owner_user_id = any(my_landlord_ids())));

grant select on public.ai_troubleshoot_resolutions to authenticated;
grant insert, select on public.ai_troubleshoot_resolutions to service_role;
