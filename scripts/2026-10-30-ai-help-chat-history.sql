-- Store the AI help-chat transcript per user so closing the bubble (which
-- unmounts AiHelpChat and wipes its in-memory state) or coming back the
-- next day doesn't lose the conversation. Read back for 30 days, then
-- lazily pruned (see help-chat/route.ts's GET handler) — same
-- fixed-window retention and lazy-delete pattern as support_escalate_hits.
create table if not exists public.ai_help_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  suggest_escalate boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.ai_help_chat_messages enable row level security;
grant select, insert, update, delete on public.ai_help_chat_messages to service_role;

create index if not exists ai_help_chat_messages_user_idx on public.ai_help_chat_messages(user_id, created_at);
