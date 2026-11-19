import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { claudeJson } from '@/lib/claude'
import { aiAccessFor } from '@/lib/aiAccess'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { FIXED_CATEGORIES } from '@/lib/categoryTaxonomy'
import { LOCATION_OPTIONS } from '@/lib/jobLocations'

export const maxDuration = 30

type Intake = { category: string | null; title: string | null; location: string | null; urgency: 'normal' | 'urgent' | 'emergency'; isEmergency: boolean; safetySteps: string[]; questions: string[] }

// POST { text, lang? } : turns a tenant's (or landlord's) own words about a
// problem into a category from the app's list, a clear title, where it is,
// how urgent, immediate safety steps if it's dangerous, and up to two
// questions a contractor would ask. The person confirms before sending.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const access = await aiAccessFor(admin, user)
  if (!access.allowed) return NextResponse.json({ error: 'Prophandld AI is not turned on for this account.', needsAi: true }, { status: 402 })
  if (await tooManyAiAssistRequests('issue-intake', user.id, 30)) return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 })

  const b = (await request.json().catch(() => ({}))) as { text?: string; lang?: string }
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 1500) : ''
  if (text.length < 4) return NextResponse.json({ error: 'Describe the problem in a few words.' }, { status: 400 })
  const es = b.lang === 'es'

  try {
    const out = await claudeJson<Intake>({
      system:
        'You help tenants report home maintenance problems. Pick the single best category from the provided list (exact text). ' +
        'Emergencies: gas smell, fire or smoke, sparking or burning smell from electrical, flooding or a burst pipe, sewage backup, no heat in freezing weather, ' +
        'carbon monoxide alarm, a broken exterior door or window lock, or anything that risks injury. ' +
        'For an emergency, safetySteps are 1-3 short immediate actions (e.g. leave the home and call 911 or the gas company from outside). ' +
        'Never give repair instructions for electrical, gas or structural problems. ' +
        `Write title, location, safetySteps and questions in ${es ? 'Spanish' : 'English'}.`,
      prompt:
        `Categories: ${FIXED_CATEGORIES.join(' | ')}\nLocations: ${LOCATION_OPTIONS.join(' | ')}\n\nTenant's description:\n"""${text}"""\n\n` +
        'Return JSON: {"category": exact category text or null, "title": under 8 words, "location": exact location text from the list (always in English) or null, ' +
        '"urgency": "normal"|"urgent"|"emergency", "isEmergency": boolean, "safetySteps": string[], ' +
        '"questions": up to 2 short questions a contractor would want answered that the description doesn\'t say}',
      maxTokens: 600,
      track: { billedUserId: access.billedUserId, callerUserId: user.id, feature: 'issue-intake' },
    })
    const category = FIXED_CATEGORIES.includes(out?.category || '') ? out.category : null
    const isEmergency = out?.isEmergency === true || out?.urgency === 'emergency'
    return NextResponse.json({
      category,
      title: typeof out?.title === 'string' ? out.title.slice(0, 80) : null,
      location: LOCATION_OPTIONS.includes(out?.location || '') ? out.location : null,
      urgency: isEmergency ? 'emergency' : out?.urgency === 'urgent' ? 'urgent' : 'normal',
      isEmergency,
      safetySteps: Array.isArray(out?.safetySteps) ? out.safetySteps.filter((s) => typeof s === 'string').slice(0, 3).map((s) => s.slice(0, 200)) : [],
      questions: Array.isArray(out?.questions) ? out.questions.filter((s) => typeof s === 'string').slice(0, 2).map((s) => s.slice(0, 160)) : [],
    })
  } catch (err) {
    console.error('ai-assist/issue-intake: failed', err)
    return NextResponse.json({ error: "Couldn't sort that out automatically. Pick a category below." }, { status: 500 })
  }
}
