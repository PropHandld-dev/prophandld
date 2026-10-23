// Kept dependency-free on purpose: lib/linkedProfiles.ts pulls in
// server-only code (sendPush, sendLinkedProfileAddedEmail), so a client
// component importing the flag straight from there would drag that whole
// chain into the browser bundle. This file imports nothing, so it's safe
// from both client and server code.

// Product decision (2026-10-23): hidden for now — confusing for some
// users in testing (Joshua and James both flagged it), candidate for a
// phase 2/3 relaunch. Flips every UI surface (ProfileButton dropdown,
// Profile page's LinkedProfilesSection card, signup's "add a profile"
// offer) back to pre-feature behavior without deleting any of them. The
// API routes, the linked_group_id column, and the self-dealing SQL
// guards all stay fully intact — re-enabling later is just flipping this
// back to true.
export const LINKED_PROFILES_ENABLED = false
