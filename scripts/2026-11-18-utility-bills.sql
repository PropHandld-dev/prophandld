-- Utility bills on a rent month: water, electric, gas, trash, sewer,
-- internet or other. Replaces the single water-only slot on rent_payments.
--
-- rent_payments.expected_amount stays the one number the tenant owes (rent +
-- utilities + any late fee). utilities_amount is the sum of this month's
-- utility charges, so the rent itself is expected - utilities - late fee.

create table if not exists public.rent_utility_charges (
  id uuid primary key default gen_random_uuid(),
  rent_payment_id uuid not null references public.rent_payments(id) on delete cascade,
  kind text not null check (kind in ('water', 'electric', 'gas', 'trash', 'sewer', 'internet', 'other')),
  label text check (label is null or char_length(label) <= 40),
  amount numeric(10, 2) not null check (amount >= 0 and amount <= 100000),
  period_start date,
  period_end date,
  document_id uuid references public.documents(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_start is null or period_end is null or period_end >= period_start)
);
create index if not exists rent_utility_charges_payment_idx on public.rent_utility_charges(rent_payment_id);
create index if not exists rent_utility_charges_document_idx on public.rent_utility_charges(document_id);

-- Read and written only through /api/rent-payment/[id]/utilities (service
-- role, after checking the caller is the owner, a co-owner, their PM, or the
-- tenant). No policies on purpose: the browser never touches this directly.
alter table public.rent_utility_charges enable row level security;
revoke all on public.rent_utility_charges from anon, authenticated;

alter table public.rent_payments add column if not exists utilities_amount numeric(10, 2) not null default 0;

-- Move every existing water bill into the new table, once.
insert into public.rent_utility_charges (rent_payment_id, kind, amount, period_start, period_end, document_id)
select rp.id, 'water', rp.water_amount, rp.water_period_start, rp.water_period_end, rp.water_bill_document_id
from public.rent_payments rp
where (coalesce(rp.water_amount, 0) > 0 or rp.water_bill_document_id is not null)
  and not exists (select 1 from public.rent_utility_charges c where c.rent_payment_id = rp.id);

update public.rent_payments
set utilities_amount = coalesce(water_amount, 0)
where coalesce(water_amount, 0) > 0 and utilities_amount = 0;

-- Required: the API routes use the service-role client, which bypasses RLS
-- but not table grants.
grant select, insert, update, delete on public.rent_utility_charges to service_role;
