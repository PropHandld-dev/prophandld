-- The category picker no longer offers "Other" anywhere (renter report,
-- contractor settings, landlord job creation) — replaced by a comprehensive
-- built-in list (src/lib/categories.ts). custom_categories held whatever
-- people had typed under the old "Other" option, including a leftover
-- security-test string and a few genuine one-off entries; none of it is
-- read or written by the app anymore. This clears it so there's nothing
-- left over if the feature is ever revisited.
delete from public.custom_categories;
