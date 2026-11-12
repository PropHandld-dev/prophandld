-- PM management fee billing: a PM admin sets a fee for a client, the
-- client (owner) pays it through Prophandld directly to the PM's own
-- Stripe Connect account -- same direct-charge shape job payments
-- already use (landlord pays contractor's connected account), just
-- landlord-pays-PM instead. Prophandld never holds the money either way.

alter table public.pm_client_portfolios add column if not exists management_fee numeric(10, 2);
alter table public.pm_client_portfolios add column if not exists management_fee_frequency text
  check (management_fee_frequency in ('one_time', 'monthly'));

-- One row per actual charge attempt -- mirrors bids.payment_status/
-- stripe_payment_intent_id's own shape, kept as its own table rather than
-- overloading pm_client_portfolios with per-payment state the way a
-- single row can't hold a history of.
create table if not exists public.pm_fee_payments (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.pm_client_portfolios(id),
  amount numeric(10, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed')),
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_pm_fee_payments_portfolio on public.pm_fee_payments(portfolio_id);

alter table public.pm_fee_payments enable row level security;
grant select, update on public.pm_fee_payments to authenticated;
grant select, insert, update on public.pm_fee_payments to service_role;

-- Same visibility shape as pm_client_portfolios itself: the owner, the
-- org admin, or an accepted org member can see a client's fee payments.
create policy "pm_fee_payments_select"
on public.pm_fee_payments for select to authenticated
using (
  portfolio_id in (
    select id from public.pm_client_portfolios
    where owner_user_id = auth.uid()
      or organization_id in (select id from public.pm_organizations where admin_user_id = auth.uid())
      or organization_id in (select organization_id from public.pm_organization_members where user_id = auth.uid() and status = 'accepted')
  )
);
