import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { claudeText } from '@/lib/claude'
import { aiAccessFor } from '@/lib/aiAccess'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'

export const maxDuration = 25

// POST { jobId, notes } : turns a contractor's rough bid notes into a clear
// scope of work the landlord can compare. Keeps every fact the contractor
// wrote; never adds prices, warranties or promises they didn't make.
// Available to contractors during the free pilot (see aiAccessFor).
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const access = await aiAccessFor(admin, user)
  if (!access.allowed) return NextResponse.json({ error: 'Not available' }, { status: 403 })
  if (await tooManyAiAssistRequests('polish-bid', user.id, 20)) return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 })

  const b = (await request.json().catch(() => ({}))) as { jobId?: string; notes?: string; lang?: string }
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 2000) : ''
  if (notes.length < 5) return NextResponse.json({ error: 'Write a few words about the work first.' }, { status: 400 })
  const { data: job } = await admin.from('jobs').select('category, description').eq('id', b.jobId || '').maybeSingle()
  try {
    const text = await claudeText({
      system:
        'You help a home-repair contractor write the notes on a bid so a landlord understands exactly what they will do. ' +
        'Rewrite their notes into a short, professional scope of work: what will be done, materials if mentioned, how long, and anything not included. ' +
        'Keep every fact they wrote. Do NOT add prices, warranties, guarantees, licenses, timelines or materials they did not mention. ' +
        `Plain text, short lines or bullets with "- ", under 120 words. Write in ${b.lang === 'es' ? 'Spanish' : 'English'}.`,
      prompt: `${job ? `Job: ${job.category}. Landlord's description: ${String(job.description || '').slice(0, 400)}\n\n` : ''}Contractor's notes:\n"""${notes}"""`,
      maxTokens: 500,
      track: { billedUserId: access.billedUserId, callerUserId: user.id, feature: 'polish-bid' },
    })
    return NextResponse.json({ text: text.slice(0, 2000) })
  } catch (err) {
    console.error('ai-assist/polish-bid: failed', err)
    return NextResponse.json({ error: 'Could not polish that right now.' }, { status: 500 })
  }
}
