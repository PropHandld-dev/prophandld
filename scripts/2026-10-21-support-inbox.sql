-- Durable record of landing-page "ask a question" submissions
-- (api/support-escalate) — previously email-only, so a missed/buried
-- email meant the question was effectively gone with no fallback
-- visibility and no open/resolved tracking. No RLS policy for
-- `authenticated` on purpose: every read/write goes through
-- requireAdminAal2()-gated /api/admin/support routes using the
-- service-role client, same pattern as /api/admin/users — not the
-- direct-client-query pattern disputes used, which needs its own RLS
-- policy to work at all.
create table if not exists public.support_escalations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  question text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id)
);

create index if not exists support_escalations_created_idx on public.support_escalations (created_at desc);
create index if not exists support_escalations_open_idx on public.support_escalations (resolved_at) where resolved_at is null;

alter table public.support_escalations enable row level security;
grant select, insert, update on public.support_escalations to service_role;
