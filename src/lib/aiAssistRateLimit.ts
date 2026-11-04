import { tooManyRequests } from '@/lib/rateLimit'

// Shared by every AI Assist route that spends real Anthropic tokens, so a
// trial-period landlord (zero revenue to Prophandld so far, since this is a
// flat monthly/trial fee, not metered usage) can't script a loop against
// the priciest ones (document extraction, lease Q&A) at unbounded real
// cost. Keyed by feature so each route gets its own independent bucket.
// Generous limits — a landlord genuinely working through several documents
// or a back-and-forth lease Q&A session easily makes a dozen+ calls — this
// is a ceiling against scripting, not a normal usage cap.
export async function tooManyAiAssistRequests(feature: string, userId: string, limit = 20, windowMinutes = 15): Promise<boolean> {
  return tooManyRequests(`${feature}:${userId}`, limit, windowMinutes)
}
