-- Missed the already-documented gotcha (supabase_gotchas memory, and the
-- working support_escalations example right next to it): a new table
-- needs an explicit grant to service_role — separate from RLS policies —
-- or every service-role query against it fails with "permission denied
-- for table X", exactly what admin_cost_items just did. Every table added
-- this session (2026-10-25/26) is only ever queried through
-- requireAdminAal2()-gated API routes using the service-role client, so
-- service_role is the only grant any of them need.

grant select, insert, update, delete on public.admin_cost_items to service_role;
grant select, insert, update, delete on public.blocked_users to service_role;
grant select, insert, update, delete on public.reported_messages to service_role;
