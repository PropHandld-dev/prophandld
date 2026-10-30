-- Joshua's ask: let a landlord star-mark a contractor they've worked with,
-- and list them on a "My Contractors" page — a direct in-platform
-- substitute for "who did I use last time, let me go find their number,"
-- the exact behavior that sends a landlord off-platform. See
-- src/app/landlord/contractors/page.tsx and
-- src/app/api/landlord/favorite-contractors/route.ts.
create table if not exists public.favorite_contractors (
  landlord_user_id uuid not null references auth.users(id) on delete cascade,
  contractor_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (landlord_user_id, contractor_user_id)
);
alter table public.favorite_contractors enable row level security;
grant select, insert, update, delete on public.favorite_contractors to service_role;

create index if not exists favorite_contractors_landlord_idx on public.favorite_contractors(landlord_user_id);
