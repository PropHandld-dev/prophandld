import { createBrowserClient } from '@supabase/ssr'

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
