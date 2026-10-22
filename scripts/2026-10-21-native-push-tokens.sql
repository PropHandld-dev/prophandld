-- Extends push_subscriptions (web-push only until now: endpoint/p256dh/
-- auth_key) to also hold native push tokens for the iOS/Android wrapper
-- apps — the web-push mechanism this app relies on doesn't work inside a
-- Capacitor WebView at all (no Web Push API support), so native push
-- needs its own token shape per platform (FCM registration token for
-- Android, APNs device token for iOS) rather than reusing the web-push
-- columns, which stay NULL on a native row.
alter table public.push_subscriptions add column if not exists platform text not null default 'web' check (platform in ('web', 'ios', 'android'));
alter table public.push_subscriptions add column if not exists native_token text;

-- A device's web-push `endpoint` is already unique per subscription; a
-- native token needs the same guarantee so re-registering the same
-- device (e.g. after reinstalling the app) updates the existing row
-- instead of accumulating duplicates that would each get a push.
create unique index if not exists push_subscriptions_native_token_idx on public.push_subscriptions (native_token) where native_token is not null;
