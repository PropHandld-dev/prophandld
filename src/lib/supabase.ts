import { createBrowserClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)

// Subscribed the instant this module loads — before any page's own code
// runs — specifically to catch Supabase's own SIGNED_IN event the moment
// it establishes a session from URL tokens (an email-confirmation link).
// This replaced an earlier attempt that parsed "type=signup" out of the
// URL hash by hand: that depended on guessing the exact format Supabase
// puts there and on winning a timing race against the client's own
// internal hash processing, and evidently didn't hold up. SIGNED_IN vs.
// INITIAL_SESSION is Supabase's own documented way to tell "a session was
// just established this page load" apart from "one already existed before
// this page ever loaded" — authoritative regardless of URL format details.
// A manual password sign-in can't reach this before a human has had time
// to type into a form, so by the time /login's mount effect checks this
// (within the same tick the page loads), a true value can only mean the
// confirmation-link case.
let freshSignInUser: User | null = null
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    freshSignInUser = session?.user ?? null
  }
})

// Self-consuming — only ever answers with a user once per real page load.
export function consumeFreshSignIn() {
  const user = freshSignInUser
  freshSignInUser = null
  return user
}

// auth.getUser() makes a network round trip to Supabase Auth on every call,
// and pages call it several times each (plus the chat widget on every
// page). In the browser it's only used to learn who is signed in — the
// database enforces access through RLS using the session's JWT regardless,
// and server routes validate the user themselves — so read the session
// that's already stored locally instead. A call that passes an explicit
// JWT still goes to the server.
const validateWithServer = supabase.auth.getUser.bind(supabase.auth)
supabase.auth.getUser = (async (jwt?: string) => {
  if (jwt) return validateWithServer(jwt)
  const { data: { session } } = await supabase.auth.getSession()
  return { data: { user: session?.user ?? null }, error: null }
}) as typeof supabase.auth.getUser
