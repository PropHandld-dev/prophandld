-- PM public profile branding + contact + team. Everything a landlord
-- comparing property managers actually looks at, beyond the existing
-- pitch/license/specialties: a logo and cover photo, a brand color, a real
-- "about" section, how to reach them, and (optionally) who's on the team.

alter table public.pm_organizations add column if not exists logo_url text;
alter table public.pm_organizations add column if not exists cover_url text;
-- Strict #RRGGBB, validated in the API before it's ever used in a style.
alter table public.pm_organizations add column if not exists brand_color text;
alter table public.pm_organizations add column if not exists about text;
alter table public.pm_organizations add column if not exists website text;
alter table public.pm_organizations add column if not exists contact_phone text;
alter table public.pm_organizations add column if not exists contact_email text;
alter table public.pm_organizations add column if not exists office_hours text;
alter table public.pm_organizations add column if not exists show_team boolean not null default false;

-- Public-read bucket for logos/cover photos (the public profile is viewable
-- logged out). No INSERT/UPDATE/DELETE policies for anon/authenticated at
-- all: uploads go only through /api/pm/profile-settings/image, which runs
-- as service role after checking the caller is the org admin and that the
-- file's actual bytes are a real JPEG/PNG/WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pm-branding', 'pm-branding', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
