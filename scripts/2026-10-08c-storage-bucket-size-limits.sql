-- Run this whole script once in the Supabase SQL editor.
-- Found during a full code-scan: file size/type limits (src/lib/mediaValidation.ts)
-- are enforced only in client-side JavaScript. Nothing stops a direct call to
-- Supabase Storage's own API (bypassing the app's UI entirely, using the
-- caller's own valid session) from uploading an arbitrarily large or
-- wrong-type file. On the free tier's 1GB total storage cap, a single such
-- upload could exhaust it for everyone. This sets the same limits at the
-- storage layer itself, where they can't be bypassed from outside the app.
--
-- job-photos allows both photos (20MB) and video (60MB) today — Storage can
-- only enforce one ceiling per bucket, so this uses the higher 60MB limit
-- for that bucket; the app's own client-side check still gives a tighter,
-- friendlier 20MB message for photos specifically before anything uploads.

update storage.buckets set file_size_limit = 62914560 where id = 'job-photos'; -- 60MB
update storage.buckets set file_size_limit = 20971520 where id = 'documents'; -- 20MB
update storage.buckets set file_size_limit = 20971520 where id = 'contractor-documents'; -- 20MB

update storage.buckets set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/heic', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'
] where id = 'job-photos';

update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] where id in ('documents', 'contractor-documents');
