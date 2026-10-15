-- Optional, per-viewer expiry reminders on documents — same shape as
-- compliance_items' reminder system, but a document can be seen by more
-- than one person (landlord and tenant) who might each want a different
-- reminder lead time or channel on the exact same document, so this is a
-- separate per-user junction table rather than columns directly on
-- documents.

create table if not exists document_reminders (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_days integer not null default 30,
  reminder_channels text[] not null default array['email', 'push'],
  last_reminder_status text,
  created_at timestamptz not null default now(),
  unique (document_id, user_id)
);

alter table document_reminders enable row level security;

-- A user can only ever see/manage their own reminder preference — never
-- another viewer's, even on a document they both have access to.
create policy "Users manage their own document reminders"
  on document_reminders for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on document_reminders to authenticated;
