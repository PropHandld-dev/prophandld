-- Minimal block/report mechanism for in-app messaging (job chat + DMs),
-- required for the iOS submission: Apple Guideline 1.2 (User-Generated
-- Content) requires apps with person-to-person messaging to let users
-- block and report each other.
--
-- Both tables are written to only through service-role API routes
-- (/api/messages/block, /api/messages/report), same pattern as
-- support_escalations (scripts/2026-10-21-support-inbox.sql) — no
-- `authenticated` policy is granted, so RLS stays enabled with no open
-- policy rather than trying to safely layer a new policy onto the
-- existing (not-in-repo) `messages`/`dm_threads` RLS.

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_user_id, blocked_user_id)
);
alter table public.blocked_users enable row level security;

create table if not exists public.reported_messages (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete set null,
  job_id uuid,
  thread_id uuid,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);
alter table public.reported_messages enable row level security;

create index if not exists blocked_users_blocker_idx on public.blocked_users(blocker_user_id);
create index if not exists reported_messages_created_idx on public.reported_messages(created_at desc);
