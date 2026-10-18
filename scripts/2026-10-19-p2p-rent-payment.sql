-- Pay rent via Zelle/Venmo/Cash App, alongside the existing Stripe card/bank
-- options. Money never touches Prophandld or Stripe for these — a landlord
-- optionally lists a handle, a renter sends it directly, and the landlord's
-- existing "Mark received" flow stays the single source of truth for
-- whether it actually arrived (same as cash/check today).

alter table public.users add column if not exists zelle_handle text;
alter table public.users add column if not exists venmo_handle text;
alter table public.users add column if not exists cashapp_handle text;

-- Set when a renter taps "I've sent this payment" — an honest signal, not
-- a confirmation. The landlord still has to see the money land in their
-- own account and mark it received themselves.
alter table public.rent_payments add column if not exists renter_marked_sent_at timestamptz;
alter table public.rent_payments add column if not exists renter_marked_sent_method text;
