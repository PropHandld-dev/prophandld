-- A job's UUID is fine for the database but useless for a landlord,
-- renter, or contractor to reference out loud ("job 7f3a2b1c..." isn't
-- something anyone reads over the phone or writes on a receipt). Adds a
-- short, sequential, human-readable work order number — assigned
-- automatically by the database on insert (no application code needs to
-- compute or race over it), global across the whole platform rather than
-- per-landlord, same way an invoice number usually works.
create sequence if not exists public.work_order_number_seq;

alter table public.jobs
  add column if not exists work_order_number integer;

-- Backfill existing rows in creation order, so the oldest job gets the
-- lowest number rather than every existing job getting an arbitrary one
-- at migration time.
with numbered as (
  select id, row_number() over (order by created_at asc) as rn
  from public.jobs
  where work_order_number is null
)
update public.jobs j
set work_order_number = numbered.rn
from numbered
where j.id = numbered.id;

-- Advance the sequence past whatever was just backfilled, so the next
-- real insert continues the count instead of colliding with it.
select setval('public.work_order_number_seq', coalesce((select max(work_order_number) from public.jobs), 0) + 1, false);

alter table public.jobs
  alter column work_order_number set default nextval('public.work_order_number_seq'),
  alter column work_order_number set not null;

alter table public.jobs
  add constraint jobs_work_order_number_unique unique (work_order_number);
