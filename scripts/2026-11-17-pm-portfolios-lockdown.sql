-- Security: close direct-from-browser writes to pm_client_portfolios.
--
-- Two RLS UPDATE policies let a signed-in user change rows directly with
-- the public anon key, bypassing every rule the API routes enforce:
--
--   pm_portfolio_admin_updates_threshold -- ANY column, ANY status, for any
--     row in the caller's org. A PM admin could accept their own invite on
--     the owner's behalf, set the owner's approval limit, or forge
--     fee_owner_approved_at to fake the owner approving a fee (which
--     unlocks auto-billing).
--   pm_portfolio_owner_accepts -- ignores requested_by, so an owner could
--     accept a request THEY sent, activating it without the PM agreeing.
--
-- Every legitimate write already goes through a service-role API route
-- (accept, PM-accept, threshold, fee, approve-fee, remove), which bypasses
-- RLS -- confirmed no client-side code writes this table. So both policies
-- and the UPDATE grant are dropped outright. SELECT and DELETE are left as
-- they were (reads power the UI; delete is "end the relationship", which
-- either side may always do).

drop policy if exists "pm_portfolio_admin_updates_threshold" on public.pm_client_portfolios;
drop policy if exists "pm_portfolio_owner_accepts" on public.pm_client_portfolios;
revoke update on public.pm_client_portfolios from authenticated;
