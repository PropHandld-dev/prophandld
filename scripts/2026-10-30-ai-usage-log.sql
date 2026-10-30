-- Per-call AI usage/cost tracking — every claudeJson() call in the app logs
-- here (see src/lib/claude.ts), so admin can see real cost per landlord
-- and per feature instead of only the worst-case estimates in the pricing
-- proposal. billed_user_id is whoever's AI Assist subscription this rides
-- on (the landlord, even when a renter or contractor triggered the call);
-- caller_user_id is whoever actually triggered it, which can differ.
create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  billed_user_id uuid references auth.users(id) on delete set null,
  caller_user_id uuid references auth.users(id) on delete set null,
  feature text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ai_usage_log enable row level security;
grant select, insert on public.ai_usage_log to service_role;

create index if not exists ai_usage_log_billed_user_idx on public.ai_usage_log(billed_user_id, created_at);
create index if not exists ai_usage_log_feature_idx on public.ai_usage_log(feature, created_at);

-- A "Claude (Anthropic)" row on /admin/costs, live like Twilio's — see
-- fetchLiveAiCost() in src/lib/costItems.ts, which sums this month's
-- ai_usage_log.cost_usd the same way the Twilio row sums usage records.
insert into public.admin_cost_items (id, label, category, pricing_note, billing_url, billing_frequency, sort_order) values
  ('claude', 'Claude (Anthropic)', 'AI (AI Assist add-on)', 'Pay-per-use, Haiku 5.5 — fractions of a cent per action, see the AI Features Proposal''s cost page', 'https://console.anthropic.com/settings/billing', 'monthly', 12)
on conflict (id) do nothing;
