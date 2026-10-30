import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { AI_ASSIST_ENABLED, type AiAssistStatus } from '@/lib/aiAssist'
import { AI_ASSIST_TRIAL_DAYS, aiAssistMonthlyAmount } from '@/lib/pricingTiers'

export async function GET() {
  if (!AI_ASSIST_ENABLED) {
    return NextResponse.json({ enabled: false, status: 'none' as AiAssistStatus })
  }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can add AI Assist' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const { data: properties, error: propertiesError } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('owner_user_id', user.id)
      .eq('archived', false)
    if (propertiesError) {
      console.error('ai-assist/status: error fetching properties', propertiesError)
      return NextResponse.json({ error: 'Could not load properties' }, { status: 500 })
    }

    const propertyIds = (properties || []).map((p) => p.id)
    let unitCount = 0
    if (propertyIds.length > 0) {
      const { count, error: unitsError } = await supabaseAdmin
        .from('units')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propertyIds)
      if (unitsError) {
        console.error('ai-assist/status: error counting units', unitsError)
        return NextResponse.json({ error: 'Could not count units' }, { status: 500 })
      }
      unitCount = count || 0
    }

    const { data: row, error: rowError } = await supabaseAdmin
      .from('ai_assist_subscriptions')
      .select('status, trial_started_at, trial_override_days, free_forever, cancel_at_period_end, current_period_end')
      .eq('landlord_user_id', user.id)
      .maybeSingle()
    if (rowError) {
      console.error('ai-assist/status: error fetching row', rowError)
      return NextResponse.json({ error: 'Could not load AI Assist status' }, { status: 500 })
    }

    const status: AiAssistStatus = (row?.status as AiAssistStatus) || 'none'
    const freeForever = !!row?.free_forever
    const trialMs = (row?.trial_override_days ?? AI_ASSIST_TRIAL_DAYS) * 24 * 60 * 60 * 1000

    let daysLeftInTrial: number | null = null
    if (status === 'trialing' && row?.trial_started_at && !freeForever) {
      const elapsedMs = Date.now() - new Date(row.trial_started_at).getTime()
      daysLeftInTrial = Math.max(0, Math.ceil((trialMs - elapsedMs) / (24 * 60 * 60 * 1000)))
    }

    return NextResponse.json({
      enabled: true,
      status,
      daysLeftInTrial,
      monthlyPrice: aiAssistMonthlyAmount(unitCount),
      freeForever,
      cancelAtPeriodEnd: !!row?.cancel_at_period_end,
      currentPeriodEnd: row?.current_period_end ?? null,
    })
  } catch (err) {
    console.error('ai-assist/status: unhandled error', err)
    return NextResponse.json({ error: 'Could not load AI Assist status' }, { status: 500 })
  }
}
