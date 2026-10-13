-- Adds an optional "which room/area" field to a reported job, separate
-- from category (what kind of issue). Comparing against a competitor's
-- maintenance-request form (screenshots shared 2026-10-13) showed this as
-- a real, distinct field their form asks for that this app's report form
-- didn't have at all — contractors currently have to read the free-text
-- description to learn which room to go to, if it's mentioned there at all.
alter table public.jobs
  add column location text;
