import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { claudeText } from '@/lib/claude'
import { aiAccessFor } from '@/lib/aiAccess'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'

export const maxDuration = 20

// POST { text, to: 'en' | 'es' } : translate a message for the reader.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const access = await aiAccessFor(admin, user)
  if (!access.allowed) return NextResponse.json({ error: 'Prophandld AI is not turned on for this account.', needsAi: true }, { status: 402 })
  if (await tooManyAiAssistRequests('translate', user.id, 60)) return NextResponse.json({ error: 'Too many translations. Try again in a few minutes.' }, { status: 429 })
  const b = (await request.json().catch(() => ({}))) as { text?: string; to?: string }
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 4000) : ''
  if (!text) return NextResponse.json({ error: 'Nothing to translate' }, { status: 400 })
  const to = b.to === 'es' ? 'Spanish' : 'English'
  try {
    const out = await claudeText({
      system: `Translate the user's message into natural, friendly ${to} as used in the United States. Keep names, addresses, amounts and dates exactly. If it is already in ${to}, return it unchanged.`,
      prompt: text,
      maxTokens: 1200,
      track: { billedUserId: access.billedUserId, callerUserId: user.id, feature: 'translate' },
    })
    return NextResponse.json({ text: out.slice(0, 6000) })
  } catch (err) {
    console.error('ai-assist/translate: failed', err)
    return NextResponse.json({ error: 'Could not translate right now.' }, { status: 500 })
  }
}
