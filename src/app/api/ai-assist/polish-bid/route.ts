import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'

export const maxDuration = 10

// Pulled for now — AI Assist is a landlord-paid add-on, and contractors
// were getting this feature for free. Worth bringing back behind a future
// contractor Pro tier, not before. The UI no longer surfaces this at all;
// this route stays only as the server-side backstop against a direct call.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  return NextResponse.json({ error: 'Not available' }, { status: 403 })
}
