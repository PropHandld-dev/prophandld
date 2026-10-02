-- Run this whole script once in the Supabase SQL editor.
-- Covers three independent fixes from today's full-codebase audit.

-- ============================================================
-- 1. Batched user-name lookup (fixes an N+1 query on the landlord
--    jobs list — one get_user_by_id round trip per job, now one call
--    total). Security model mirrors get_user_by_id exactly: any
--    authenticated user can resolve any other user's id to a display
--    name, nothing more sensitive than that.
-- ============================================================
create or replace function get_users_by_ids(user_ids_input uuid[])
returns table (id uuid, full_name text)
language sql
security definer
set search_path = public
as $$
  select id, full_name from public.users where id = any(user_ids_input)
$$;

grant execute on function get_users_by_ids(uuid[]) to authenticated;

-- ============================================================
-- 2. Server-side teeth for the late-fee cap. The app already blocks
--    saving an excessive late fee in the UI (src/lib/lateFee.ts,
--    10% of rent), but that's only ever enforced client-side — this
--    is the same rule enforced at the database, so a direct REST/
--    devtools call can't bypass it the way the UI check alone could.
-- ============================================================
alter table tenancies
  add constraint tenancies_late_fee_within_cap
  check (
    late_fee_amount is null
    or rent_amount is null
    or late_fee_amount <= rent_amount * 0.10
  );

-- ============================================================
-- 3. Backing table for /api/support-escalate's rate limiter. That
--    route is public (no login required) and was using an in-memory
--    Map to throttle abuse — which doesn't actually work on Vercel,
--    since serverless functions scale across many instances, each
--    with its own empty Map. This is a real shared counter instead.
--    No RLS policies on purpose — service-role only, same pattern as
--    every other backend-only table in this app.
-- ============================================================
create table if not exists support_escalate_hits (
  id bigint generated always as identity primary key,
  rate_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_escalate_hits_key_time_idx
  on support_escalate_hits (rate_key, created_at);

alter table support_escalate_hits enable row level security;
