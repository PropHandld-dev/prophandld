import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { claudeText } from '@/lib/claude'
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
  // Plain labelled sections, not JSON: long number-heavy answers broke JSON
  // parsing about half the time. One retry covers a bad reply.
  const ask = () =>
    claudeText({
      system:
        "You summarize a landlord's year of rental income and expenses in plain language. Use only the numbers given; do the arithmetic carefully. " +
        'Do not give tax advice or say what is deductible; suggest confirming with a tax professional where relevant.',
      prompt:
        `Data: ${data}\n\nReply in exactly this format, plain text, no markdown:\n` +
        'SUMMARY: 2-3 sentences\n' +
        'HIGHLIGHTS:\n- up to 4 short lines on what stands out (best or weakest property, biggest expense type, a month that spiked)\n' +
        'CHECKS:\n- up to 4 short lines on what to review before filing (expenses without receipts, deposits that are not income, categories at $0 such as insurance or property tax)',
      maxTokens: 900,
      track: { billedUserId: access.billedUserId, callerUserId: user.id, feature: 'records-insights' },
    })
  // Tolerant of how the model formats the labels ("SUMMARY:", "Summary:",
  // "**Summary**:", "## Summary"); if no labels at all, the whole reply is
  // the summary rather than an error.
  const parse = (raw: string) => {
    const text = raw.replace(/\*\*/g, '').replace(/^#+\s*/gm, '')
    const labels = ['SUMMARY', 'HIGHLIGHTS', 'CHECKS']
    const find = (name: string) => {
      const m = text.match(new RegExp(`(^|\\n)\\s*${name}\\s*:?\\s*`, 'i'))
      if (!m || m.index === undefined) return ''
      const start = m.index + m[0].length
      let end = text.length
      for (const other of labels) {
        if (other === name) continue
        const o = text.slice(start).match(new RegExp(`\\n\\s*${other}\\s*:?`, 'i'))
        if (o && o.index !== undefined) end = Math.min(end, start + o.index)
      }
      return text.slice(start, end).trim()
    }
    const bullets = (block: string) =>
      block.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean).slice(0, 4)
    const summary = find('SUMMARY') || text.split(/\n\s*\n/)[0] || text
    return { summary: summary.replace(/\s+/g, ' ').trim().slice(0, 800), highlights: bullets(find('HIGHLIGHTS')), checks: bullets(find('CHECKS')) }
  }
  try {
    let result = parse(await ask())
    if (!result.summary) result = parse(await ask())
    if (!result.summary) throw new Error('no summary in reply')
    return NextResponse.json(result)
  } catch (err) {
    console.error('ai-assist/records-insights: failed', err)
    // The AI service's own error type (e.g. overloaded, rate limited), so a
    // failure can be told apart from a bad reply. No user data in it.
    const reason = (err as any)?.error?.error?.type || (err as any)?.status || (err as any)?.name || 'unknown'
    return NextResponse.json({ error: 'Could not read your year right now. Try again in a moment.', reason: String(reason).slice(0, 60) }, { status: 500 })
  }
}
