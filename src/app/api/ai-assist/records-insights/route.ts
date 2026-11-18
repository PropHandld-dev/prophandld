import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { claudeJson } from '@/lib/claude'
import { aiAccessFor } from '@/lib/aiAccess'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'

export const maxDuration = 30

// POST { year, totals, byProperty, byLine, byMonth, missingReceipts } :
// a short plain-language read of the caller's own year (numbers come from
// their Records page), plus a few things worth checking. Not tax advice.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const access = await aiAccessFor(admin, user)
  if (!access.allowed) return NextResponse.json({ error: 'Prophandld AI is not turned on for this account.', needsAi: true }, { status: 402 })
  if (await tooManyAiAssistRequests('records-insights', user.id, 15)) return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const data = JSON.stringify(b).slice(0, 8000)
  try {
    const out = await claudeJson<{ summary: string; highlights: string[]; checks: string[] }>({
      system:
        'You summarize a landlord\'s year of rental income and expenses in plain language. Use only the numbers given; do the arithmetic carefully. ' +
        'Highlights: what stands out (best/worst property, biggest expense type, a month that spiked). ' +
        'Checks: practical things to review before filing (expenses without receipts, deposits that are not income, possible missing categories like insurance or property tax if they are $0). ' +
        'Do not give tax advice or say what is deductible; suggest confirming with a tax professional where relevant.',
      prompt: `Data: ${data}\n\nReturn {"summary": 2-3 sentences, "highlights": up to 4 short items, "checks": up to 4 short items}`,
      maxTokens: 800,
      track: { billedUserId: access.billedUserId, callerUserId: user.id, feature: 'records-insights' },
    })
    return NextResponse.json({
      summary: String(out?.summary || '').slice(0, 800),
      highlights: (out?.highlights || []).filter((x) => typeof x === 'string').slice(0, 4),
      checks: (out?.checks || []).filter((x) => typeof x === 'string').slice(0, 4),
    })
  } catch (err) {
    console.error('ai-assist/records-insights: failed', err)
    return NextResponse.json({ error: 'Could not read your year right now.' }, { status: 500 })
  }
}
