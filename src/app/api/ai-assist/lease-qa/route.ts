import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

// Renter-facing, but gated on the LANDLORD's AI Assist status, not the
// renter's — renters don't have billing, this rides on whatever their
// landlord has turned on, same as every other landlord-paid add-on in this
// app. Answers only from the real lease fields already on the tenancy row,
// never generic "typically, leases allow..." filler — if the lease doesn't
// cover it, the model is instructed to say so.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'renter') {
    return NextResponse.json({ error: 'Only renters can ask about their lease here' }, { status: 403 })
  }

  const { question } = (await request.json()) as { question?: string }
  if (!question || !question.trim() || question.length > 500) {
    return NextResponse.json({ error: 'Ask a question up to 500 characters.' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // The primary-tenant case only for v1 — get_my_active_tenancy_id (used
  // elsewhere for the co-renter case too, via tenancy_occupants) runs in
  // the caller's own RLS context and has no variant that takes an explicit
  // user id, so it can't be reused from this service-role route.
  const { data: tenancy } = await supabaseAdmin
    .from('tenancies')
    .select('*')
    .eq('renter_user_id', user.id)
    .eq('ended', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tenancy) {
    return NextResponse.json({ error: 'No active lease found on your account.' }, { status: 404 })
  }

  const { data: unit } = await supabaseAdmin
    .from('units')
    .select('unit_number, properties(address, owner_user_id)')
    .eq('id', tenancy.unit_id)
    .maybeSingle()
  const property: any = (unit as any)?.properties
  const landlordUserId = property?.owner_user_id
  if (!landlordUserId) {
    return NextResponse.json({ error: 'Could not find your landlord on this unit.' }, { status: 404 })
  }

  if (!(await hasAiAssistAccess(supabaseAdmin, landlordUserId))) {
    return NextResponse.json({ error: 'Your landlord hasn’t turned on AI Assist yet.' }, { status: 403 })
  }

  const leaseFacts = {
    monthly_rent: tenancy.rent_amount,
    rent_due_day: tenancy.rent_due_day,
    lease_start: tenancy.lease_start,
    lease_end: tenancy.lease_end,
    security_deposit: tenancy.security_deposit,
    rent_escalation_percent: tenancy.escalation_percent,
    rent_escalation_frequency_months: tenancy.escalation_frequency_months,
    late_fee_amount: tenancy.late_fee_amount,
    grace_period_days: tenancy.grace_period_days,
    occupants: tenancy.occupants,
    pets: tenancy.pets,
    lease_notes: tenancy.lease_notes,
  }

  try {
    const result = await claudeJson<{ answer: string }>({
      system:
        'You answer a renter\'s question about their own lease for a property management app. Answer ONLY ' +
        'using the lease facts provided below — never generic "typically, leases allow..." advice that may ' +
        'not apply to this actual lease. If the facts don\'t cover the question, say so plainly rather than ' +
        'guessing. This is informational, not legal advice, and you should make that clear if the question ' +
        'sounds like it needs a real legal opinion (an eviction, a dispute, anything adversarial). Keep the ' +
        'answer to 2-4 sentences, plain language, no markdown formatting.',
      prompt: `Lease facts (JSON, null means not on file): ${JSON.stringify(leaseFacts)}\n\nQuestion: ${question.trim()}\n\nReturn JSON: { "answer": string }`,
      maxTokens: 400,
      track: { billedUserId: landlordUserId, callerUserId: user.id, feature: 'lease-qa' },
    })

    return NextResponse.json({ answer: result.answer })
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/lease-qa: Claude not configured', err)
      return NextResponse.json({ error: 'This isn’t set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/lease-qa: unhandled error', err)
    return NextResponse.json({ error: 'Could not answer that right now. Try again in a moment.' }, { status: 500 })
  }
}
