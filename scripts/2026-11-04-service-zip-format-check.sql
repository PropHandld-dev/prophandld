-- Caught live by an external audit: a contractor's service ZIP accepted
-- "ABCDE" and saved it successfully, surviving reload with no usable
-- location — the app had already added a client-side format check
-- alongside this, but that alone can be bypassed by anyone hitting the
-- table directly. Real server-side enforcement of the format (not
-- existence — that needs the zipcodes package, server-side only, and
-- isn't practical as a blocking DB constraint).
alter table public.users
  add constraint users_service_zip_format
  check (service_zip is null or service_zip ~ '^\d{5}$')
  not valid;
