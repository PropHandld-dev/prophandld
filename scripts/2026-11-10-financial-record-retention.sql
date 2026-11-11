-- A reviewer flagged that account deletion hard-deletes payment history
-- immediately and irreversibly, which is a real recordkeeping/tax-law risk
-- for a business that moves money. Standard practice for this exact
-- problem: archive the financial FACTS (amount, date, method, Stripe IDs)
-- before deleting the live, PII-linked rows, keyed only to the deleted
-- account's bare UUID (no name/email attached once the user row is gone).
-- Picked 7 years as a reasonable general-purpose default for US business
-- financial recordkeeping -- confirm with an actual accountant/attorney,
-- this is a stopgap, not a final legal answer.
create table if not exists public.deleted_account_financial_archive (
  id uuid primary key default gen_random_uuid(),
  archived_at timestamptz not null default now(),
  purge_after timestamptz not null,
  original_user_id uuid not null,
  record_type text not null, -- 'rent_payment' | 'job_payment'
  amount numeric,
  currency text default 'usd',
  payment_method text,
  paid_at timestamptz,
  stripe_payment_intent_id text,
  context_label text -- e.g. job category or "rent", non-identifying
);

create index if not exists deleted_account_financial_archive_purge_idx
  on public.deleted_account_financial_archive (purge_after);

alter table public.deleted_account_financial_archive enable row level security;
grant select, insert, delete on public.deleted_account_financial_archive to service_role;
