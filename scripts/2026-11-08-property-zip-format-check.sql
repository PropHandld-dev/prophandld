-- Caught live by an external audit (SEC-02): a property's ZIP accepted
-- "QA-INVALID-ZIP" and saved it successfully with no format check at all
-- -- client-side validation was added alongside this, but that alone can
-- be bypassed by anyone hitting the table directly. Same pattern as
-- users_service_zip_format (2026-11-04).
alter table public.properties
  add constraint properties_zip_format
  check (zip is null or zip ~ '^\d{5}$')
  not valid;
