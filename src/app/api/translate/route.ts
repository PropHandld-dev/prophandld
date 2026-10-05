import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'

// On-demand, per-message translation — not auto-translate-everything.
// Chat is real-time and user-generated, unlike the static page content
// that's already fully translated app-wide; running every message
// through a paid API automatically would cost money and add latency on
// conversations that are already same-language most of the time. This
// only ever runs when someone taps "See translation" on one specific
// message, and the caller is expected to cache the result so a second
// tap on the same message doesn't call this again.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'Translation is not configured yet' }, { status: 503 })
  }

  const { text, target } = (await request.json()) as { text?: string; target?: string }
  if (!text?.trim()) {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 })
  }
  // Only the two languages this app actually supports — never pass a
  // caller-supplied target straight through to an external API unchecked.
  const targetLang = target === 'es' ? 'es' : 'en'

  try {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text.trim(), target: targetLang, format: 'text' }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('translate: Google API error', { status: res.status, data })
      return NextResponse.json({ error: 'Could not translate this message' }, { status: 502 })
    }
    const translated = data?.data?.translations?.[0]?.translatedText
    if (!translated) {
      return NextResponse.json({ error: 'Could not translate this message' }, { status: 502 })
    }
    return NextResponse.json({ translated })
  } catch (err) {
    console.error('translate: request failed', err)
    return NextResponse.json({ error: 'Could not translate this message' }, { status: 500 })
  }
}
