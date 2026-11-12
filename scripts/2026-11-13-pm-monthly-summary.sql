-- PM-controlled notification setting: whether this client gets an
-- automated monthly summary email (rent collected, maintenance paid,
-- net) from Prophandld. Off by default -- an opt-in the PM admin turns
-- on per client, not a blanket email everyone starts getting.
alter table public.pm_client_portfolios add column if not exists monthly_summary_enabled boolean not null default false;
