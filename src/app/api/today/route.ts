import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { landlordTodayTasks, renterTodayTasks } from '@/lib/todayTasks'

export const maxDuration = 20

// GET -> { tasks } for the signed-in landlord/PM/owner or renter. See
// lib/todayTasks.ts.
export async function GET(request: Request) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  // The screen's language (it can differ from the saved preference).
  const asked = new URL(request.url).searchParams.get('lang')
  const lang = (asked || user.user_metadata?.preferred_language) === 'es' ? 'es' : 'en'
  const role = user.app_metadata?.role
  try {
    if (role === 'landlord') return NextResponse.json({ tasks: await landlordTodayTasks(admin, user.id, lang) })
    if (role === 'renter') {
      const { data: tenancyId } = await authClient.rpc('get_my_active_tenancy_id')
      return NextResponse.json({ tasks: await renterTodayTasks(admin, user.id, tenancyId || null, lang) })
    }
    return NextResponse.json({ tasks: [] })
  } catch (err) {
    console.error('today: failed', err)
    return NextResponse.json({ error: 'Could not load your list right now.' }, { status: 500 })
  }
}
