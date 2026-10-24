-- Nevin (nevinjvt@gmail.com, landlord) is still getting "new job near you"
-- push notifications — those only ever go to a contractor-role account.
-- Hiding the profile-switcher UI didn't remove any linked profile or
-- push subscription created earlier while testing it; this finds and
-- removes the specific leftover subscription causing it.

-- 1. See every account in Nevin's linked group, with its real role
--    (role lives in auth.users, not public.users).
select u.id, u.email, u.linked_group_id, au.raw_app_meta_data->>'role' as role
from public.users u
join auth.users au on au.id = u.id
where u.linked_group_id = (select linked_group_id from public.users where email = 'nevinjvt@gmail.com');

-- 2. See which of those accounts has a push subscription at all —
--    the contractor-role one from the list above is almost certainly
--    the culprit, registered on the same device/browser Nevin uses.
select ps.id, ps.user_id, u.email, au.raw_app_meta_data->>'role' as role, ps.platform, ps.created_at
from public.push_subscriptions ps
join public.users u on u.id = ps.user_id
join auth.users au on au.id = ps.user_id
where u.linked_group_id = (select linked_group_id from public.users where email = 'nevinjvt@gmail.com');

-- 3. Once you've confirmed which row is the contractor-role one from
--    query 2 above, delete it by its id (swap in the real id):
-- delete from public.push_subscriptions where id = '<id from query 2>';
