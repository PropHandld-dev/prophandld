import { createClient } from '@supabase/supabase-js'

// Server-only. Bypasses RLS via the service role key — never import this
// from a 'use client' file or expose it to the browser bundle.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
)
