-- Itemized infra/vendor cost tracking for /admin/costs, replacing the
-- single hand-typed "Infrastructure" number on the main admin dashboard
-- with a real per-service breakdown. Same no-authenticated-RLS pattern as
-- reported_messages/support_escalations: written only through
-- requireAdminAal2()-gated /api/admin/cost-items, using the service-role
-- client.
--
-- monthly_estimate starts at 0 for everything — these are real dollar
-- figures only you know from each platform's own billing page (that's
-- exactly what the billing_url on each row is for), not numbers this
-- migration should guess at.

create table if not exists public.admin_cost_items (
  id text primary key,
  label text not null,
  category text not null,
  pricing_note text,
  billing_url text,
  monthly_estimate numeric not null default 0,
  billing_frequency text not null default 'monthly' check (billing_frequency in ('monthly', 'annual', 'one_time')),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.admin_cost_items enable row level security;

insert into public.admin_cost_items (id, label, category, pricing_note, billing_url, billing_frequency, sort_order) values
  ('stripe', 'Stripe', 'Payments processing', '2.9% + 30¢ per domestic card charge · 0.8% (capped $5) per ACH debit — both surcharged to the payer, not a direct cost to Prophandld, but the monthly platform/Connect fees are', 'https://dashboard.stripe.com/settings/billing', 'monthly', 1),
  ('vercel', 'Vercel', 'Hosting (Next.js app + cron)', 'Hobby plan as of launch — free, but has real limits worth reviewing before scale', 'https://vercel.com/account/billing', 'monthly', 2),
  ('supabase', 'Supabase', 'Database, auth, storage', 'Nano instance tier, no automatic backups on this plan — check current usage-based add-ons', 'https://supabase.com/dashboard/org/_/billing', 'monthly', 3),
  ('twilio', 'Twilio', 'SMS (alerts + verification codes)', 'Pay-as-you-go: ~$1.15/mo per US number (2 numbers in use) plus per-message usage', 'https://console.twilio.com/us1/billing/manage-billing/billing-overview', 'monthly', 4),
  ('resend', 'Resend', 'Transactional email', 'Free up to 3,000 emails/mo, paid tiers from ~$20/mo past that', 'https://resend.com/settings/billing', 'monthly', 5),
  ('google-cloud', 'Google Cloud', 'Places Autocomplete + Translation API', 'Pay-as-you-go per request/character — review both APIs'' usage under the same billing project', 'https://console.cloud.google.com/billing', 'monthly', 6),
  ('sentry', 'Sentry', 'Error tracking', 'Free developer tier covers light usage; paid tiers scale with event volume', 'https://prophandld.sentry.io/settings/billing/', 'monthly', 7),
  ('posthog', 'PostHog', 'Product analytics', 'Wired into the app but currently inactive in production (no project token set) — $0 right now', 'https://us.posthog.com/organization/billing', 'monthly', 8),
  ('domain', 'Domain registration', 'prophandld.com', 'Annual renewal — amount depends on registrar', null, 'annual', 9),
  ('apple-developer', 'Apple Developer Program', 'iOS App Store distribution', '$99/year flat', 'https://developer.apple.com/account/#/membership', 'annual', 10),
  ('google-play', 'Google Play Developer', 'Android distribution', '$25 one-time registration fee', 'https://play.google.com/console/developers', 'one_time', 11)
on conflict (id) do nothing;
