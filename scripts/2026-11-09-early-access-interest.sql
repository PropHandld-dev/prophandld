-- Reuses event_interest instead of a new table: same shape (an email, a
-- timestamp, admin-notified), just a second list for "get early access"
-- interest from the landing page's redesigned hero/CTA section, separate
-- from the Philadelphia in-person launch event list. A landlord could
-- plausibly want to be on both lists, so the uniqueness constraint moves
-- from (email) alone to (email, interest_type).
alter table public.event_interest add column if not exists interest_type text not null default 'event';

drop index if exists public.event_interest_email_idx;
create unique index if not exists event_interest_email_type_idx on public.event_interest (lower(email), interest_type);
