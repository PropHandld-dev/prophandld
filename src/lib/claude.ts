import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Server-only, lazy-built — same reasoning as getStripe()/getSupabaseAdmin:
// a missing ANTHROPIC_API_KEY shouldn't crash the build, only the first
// real call that needs it.
let client: Anthropic | null = null

export function getClaude() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim() })
  }
  return client
}

// Haiku 5.5 — see the AI Features Proposal PDF's cost page for the
// reasoning: verifiable published pricing, well-suited to structured
// extraction and short drafting tasks, fractions of a cent per use even
// heavily padded.
export const CLAUDE_MODEL = 'claude-haiku-5-5'

// The in-app assistant is the one place people ask open-ended questions
// (local rental law, what to do about a no-heat call, how a feature works),
// where Haiku's answers were sometimes wrong. Only that feature uses this.
export const CLAUDE_SMART_MODEL = 'claude-sonnet-5-5'

// Published Haiku 5.5 rate — see the proposal's cost page. Used only to
// compute the cost_usd column on ai_usage_log for admin's cost-per-user
// view; never shown to end users, who only see the already-published
// per-action estimates in the proposal itself.
// Per-model $/token. The Sonnet figure is an estimate; correct it here if
// the published rate differs, and /admin/ai-usage follows.
const RATES: Record<string, { input: number; output: number }> = {
  [CLAUDE_MODEL]: { input: 0.10 / 1_000_000, output: 0.50 / 1_000_000 },
  [CLAUDE_SMART_MODEL]: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
}

export class ClaudeConfigError extends Error {}

// Every real call site passes this so admin can see cost per landlord and
// per feature (scripts/2026-10-30-ai-usage-log.sql) — billedUserId is
// whichever landlord's AI Assist this rides on, even when a renter or
// contractor actually triggered it; callerUserId is whoever that was.
// Fire-and-forget: a logging failure must never fail the real AI call.
type UsageTrack = { billedUserId: string | null; callerUserId: string | null; feature: string }

async function logUsage(track: UsageTrack, inputTokens: number, outputTokens: number, model: string = CLAUDE_MODEL) {
  const rate = RATES[model] || RATES[CLAUDE_MODEL]
  const cost = inputTokens * rate.input + outputTokens * rate.output
  const { error } = await getSupabaseAdmin().from('ai_usage_log').insert({
    billed_user_id: track.billedUserId,
    caller_user_id: track.callerUserId,
    feature: track.feature,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
  })
  if (error) console.error('claudeJson: usage log insert failed', { feature: track.feature, error })
}

// Features whose output is prose read by the person who asked for it.
// For a Spanish-speaking user these answer in Spanish. Left out on purpose:
// features that already follow the conversation's language (help-chat,
// translate, issue-intake, troubleshoot, polish-bid, pm-thread-draft,
// smart-replies), the Pennsylvania lease text, and data extraction.
const LOCALIZED_FEATURES = new Set([
  'records-insights', 'compare-bids', 'compliance-gap-check', 'compliance-renewal-guide', 'lease-qa',
  'portfolio-digest', 'before-after-check', 'job-ready-check', 'job-ready-recheck', 'draft-message', 'pm-summary-note',
])

async function languageNote(track: UsageTrack): Promise<string> {
  if (!LOCALIZED_FEATURES.has(track.feature) || !track.callerUserId) return ''
  const { data } = await getSupabaseAdmin().from('users').select('preferred_language').eq('id', track.callerUserId).maybeSingle()
  return data?.preferred_language === 'es'
    ? '\n\nWrite every sentence meant for the reader in Spanish. Keep JSON keys, enum values, numbers, dates and names exactly as specified.'
    : ''
}

function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeConfigError('ANTHROPIC_API_KEY is not configured')
  }
}

// Every AI feature in this app follows the same shape: send an instruction
// plus some real data (a document image, a typed description), get back
// one JSON object, never prose. Centralizing the "ask for JSON, parse it,
// fail loudly if the model didn't comply" logic here means every feature
// route is just its own prompt + schema, not its own parsing code.
type FileInput = {
  base64: string
  // application/pdf uses Claude's document content block (reads both text
  // and layout per page — a scanned lease is still legible this way, not
  // just text-extracted); anything else goes through the image block. Both
  // end up in the same spot in the content array either way.
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf'
}

export async function claudeJson<T>({
  system,
  prompt,
  file,
  files,
  maxTokens = 1024,
  track,
  isRetry = false,
}: {
  system: string
  prompt: string
  file?: FileInput
  // For a feature that needs to compare multiple images in one call (e.g.
  // before/after photos) — sent in array order, so the prompt can refer to
  // "the first image" / "the second image" unambiguously.
  files?: FileInput[]
  maxTokens?: number
  track: UsageTrack
  isRetry?: boolean
}): Promise<T> {
  requireApiKey()
  const anthropic = getClaude()

  const content: Anthropic.Messages.ContentBlockParam[] = []
  for (const f of [...(file ? [file] : []), ...(files || [])]) {
    if (f.mediaType === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 } })
    } else {
      content.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.base64 } })
    }
  }
  content.push({ type: 'text', text: prompt })
  const langNote = await languageNote(track)

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // A ceiling, not a target: prompts already ask for short answers. Too
    // low a ceiling cut replies off mid-JSON (compliance guide, drafts,
    // troubleshooting all hit it), so every call gets room to finish.
    max_tokens: Math.max(maxTokens, 2000),
    system: `${system}${langNote}\n\nRespond with ONLY a single valid JSON object, no markdown fences, no commentary before or after it.`,
    messages: [{ role: 'user', content }],
  })

  // Logged regardless of what happens below — a call that burned real
  // tokens but then failed to parse as JSON still cost real money and
  // belongs in the cost-per-user numbers. Awaited, not fire-and-forget: a
  // serverless function's execution can be torn down the instant its
  // response is sent, which raced this insert on every single call site
  // (every AI route returns right after claudeJson resolves) — caught live
  // via the identical bug in help-chat's own chat-history insert, which
  // shares this exact fire-and-forget shape. ai_usage_log was very likely
  // silently losing rows since it was built, which would mean /admin/costs
  // has been undercounting the whole time.
  try {
    await logUsage(track, message.usage.input_tokens, message.usage.output_tokens)
  } catch (err) {
    console.error('claudeJson: usage logging threw', err)
  }

  const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) throw new Error('Claude did not return a text response')

  // Models occasionally wrap JSON in a fence despite instructions not to —
  // strip it rather than fail the whole feature over formatting.
  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(raw) as T
  } catch {
    // Sometimes a sentence comes before or after the object; take the
    // outermost {...} before giving up.
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T
      } catch {}
    }
  }
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    // Truncated — `raw` can include real account/lease content the model
    // was answering with (a rent amount, a compliance item), and this is
    // the one place in the AI pipeline that log line wasn't already
    // bounded. Enough left to diagnose a formatting failure, not enough
    // to be a meaningful data dump.
    console.error('claudeJson: failed to parse model output as JSON', { raw: raw.slice(0, 200), err })
    // One fresh attempt: a malformed reply is usually a one-off.
    if (!isRetry) return claudeJson<T>({ system, prompt, file, files, maxTokens, track, isRetry: true })
    throw new Error('Could not read the AI response. Try again.')
  }
}

// For features whose whole output is one piece of prose (message drafts):
// asking for JSON just adds a way to fail, so take the text as-is.
export async function claudeText({ system, prompt, maxTokens = 800, track, model = CLAUDE_MODEL, raw = false }: { system: string; prompt: string; maxTokens?: number; track: UsageTrack; model?: string; raw?: boolean }): Promise<string> {
  requireApiKey()
  const langNote = await languageNote(track)
  const message = await getClaude().messages.create({
    model,
    // Headroom: a small limit can run out before any visible text is
    // written, which comes back as an empty reply.
    max_tokens: Math.max(maxTokens, 2000),
    // raw: the caller's own system prompt defines the whole output format.
    system: raw ? system + langNote : `${system}${langNote}\n\nReply with only the message text itself: no quotes around it, no preamble, no notes.`,
    messages: [{ role: 'user', content: prompt }],
  })
  try {
    await logUsage(track, message.usage.input_tokens, message.usage.output_tokens, model)
  } catch (err) {
    console.error('claudeText: usage logging threw', err)
  }
  const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  const text = (textBlock?.text || '').trim().replace(/^["“]|["”]$/g, '')
  if (!text) throw new Error('Claude returned no text')
  return text
}

// Same as claudeText with `raw`, but hands each piece of text to onText as
// it's written, so a chat can show the reply forming instead of a spinner.
// Resolves with the full text; usage is logged before it resolves.
export async function claudeStream({ system, prompt, maxTokens = 1500, track, model = CLAUDE_MODEL, onText }: { system: string; prompt: string; maxTokens?: number; track: UsageTrack; model?: string; onText: (delta: string) => void }): Promise<string> {
  requireApiKey()
  const stream = getClaude().messages.stream({
    model,
    max_tokens: Math.max(maxTokens, 2000),
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  stream.on('text', (delta) => onText(delta))
  const message = await stream.finalMessage()
  try {
    await logUsage(track, message.usage.input_tokens, message.usage.output_tokens, model)
  } catch (err) {
    console.error('claudeStream: usage logging threw', err)
  }
  const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  const text = (textBlock?.text || '').trim()
  if (!text) throw new Error('Claude returned no text')
  return text
}
