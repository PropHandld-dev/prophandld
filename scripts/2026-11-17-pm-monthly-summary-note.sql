-- The PM's personal note at the top of a client's monthly summary email
-- (written by the PM, optionally rewritten with AI). Only the note is
-- customizable -- the dollar figures are always computed from real
-- payment records at send time, so AI can never alter a number.
alter table public.pm_client_portfolios add column if not exists monthly_summary_note text;
