import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Server-only. Bypasses RLS via the service role key — never import this
// from a 'use client' file or expose it to the browser bundle.
// Built lazily so a missing SUPABASE_SERVICE_ROLE_KEY doesn't crash the
// build (Next.js evaluates route modules at build time to collect page
// data, before any request-time env vars are guaranteed to be set).
let adminClient: SupabaseClient | null = null

export function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
  }
  return adminClient
}
