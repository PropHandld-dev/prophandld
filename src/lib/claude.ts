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

// Published Haiku 5.5 rate — see the proposal's cost page. Used only to
// compute the cost_usd column on ai_usage_log for admin's cost-per-user
// view; never shown to end users, who only see the already-published
// per-action estimates in the proposal itself.
const INPUT_RATE_PER_TOKEN = 0.10 / 1_000_000
const OUTPUT_RATE_PER_TOKEN = 0.50 / 1_000_000

export class ClaudeConfigError extends Error {}

// Every real call site passes this so admin can see cost per landlord and
// per feature (scripts/2026-10-30-ai-usage-log.sql) — billedUserId is
// whichever landlord's AI Assist this rides on, even when a renter or
// contractor actually triggered it; callerUserId is whoever that was.
// Fire-and-forget: a logging failure must never fail the real AI call.
type UsageTrack = { billedUserId: string | null; callerUserId: string | null; feature: string }

async function logUsage(track: UsageTrack, inputTokens: number, outputTokens: number) {
  const cost = inputTokens * INPUT_RATE_PER_TOKEN + outputTokens * OUTPUT_RATE_PER_TOKEN
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

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: `${system}\n\nRespond with ONLY a single valid JSON object, no markdown fences, no commentary before or after it.`,
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
  } catch (err) {
    console.error('claudeJson: failed to parse model output as JSON', { raw, err })
    throw new Error('Could not read the AI response. Try again.')
  }
}
