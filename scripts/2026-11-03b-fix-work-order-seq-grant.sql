-- CRITICAL FIX — confirmed live via an external audit and reproduced
-- directly: every job creation (renter report, landlord new-job) has
-- been failing since 2026-11-03-work-order-number.sql ran, with
-- "permission denied for sequence work_order_number_seq" (Postgres code
-- 42501). A newly created sequence has no default grants — the jobs
-- table's own insert grant doesn't extend to a column's DEFAULT
-- nextval() on a sequence that was never explicitly granted. Both job
-- creation paths insert directly from the client as the authenticated
-- role, which is exactly the role that was missing this grant.
grant usage, select on sequence public.work_order_number_seq to authenticated;
grant usage, select on sequence public.work_order_number_seq to service_role;
