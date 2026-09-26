import { createBrowserClient } from '@supabase/ssr'

// Captured before anything else in this module runs — specifically before
// createBrowserClient() below, which is what actually processes and clears
// the URL's auth hash as part of constructing the client. Reading the hash
// from a React effect on the page turned out to be too late: by the time
// any component mounts, this module has already been imported and the
// client already built, hash already gone. This is the one place early
// enough to still see it, which is how /login tells "just clicked an
// email-confirmation link" apart from any other reason a session might
// already exist there.
export const HAD_SIGNUP_HASH_ON_LOAD =
  typeof window !== 'undefined' && window.location.hash.includes('type=signup')

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
