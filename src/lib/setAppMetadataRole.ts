// Calls the one-time, server-enforced route that copies a freshly created
// account's role into app_metadata (see /api/auth/set-role for why this
// has to be server-side and why it's one-way). Needs an actual session,
// so this only ever gets called from the two points a session genuinely
// exists after signup: immediately, on the rare project config where
// email confirmation isn't required, and from /login when it picks up a
// confirmation flow's fresh SIGNED_IN session. Fire-and-log, same
// reasoning as the other post-signup sync calls near this one — if it
// fails, the account still works, it's just not yet trusted for
// role-gated server actions until a human re-runs it.
export function setAppMetadataRole(role: string) {
  fetch('/api/auth/set-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  }).then(async (res) => {
    if (!res.ok) console.error('could not set app_metadata.role', await res.text().catch(() => ''))
  }).catch((err) => console.error('could not set app_metadata.role', err))
}
