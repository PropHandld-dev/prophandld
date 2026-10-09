-- Multi-role account linking: one real person, multiple role-specific
-- profiles (e.g. landlord + contractor), switchable without a second
-- password. Each profile stays a fully separate auth user and public.users
-- row, exactly as today — this just adds a shared group id that links them.
-- See src/lib/linkedProfiles.ts for how it's used.

alter table public.users
  add column if not exists linked_group_id uuid;

-- Every existing account starts as its own group of one — a landlord who
-- later adds a contractor profile gets their own id stamped here as the
-- anchor, and the new profile joins that same value.
update public.users
  set linked_group_id = id
  where linked_group_id is null;

create index if not exists idx_users_linked_group on public.users(linked_group_id);
