'use client'

import { useState } from 'react'

type Result = { summary: string; picks: { bidId: string; label: string; reason: string }[]; watchFor: string[]; questions: { bidId: string; question: string }[] }

// "Help me choose": an AI read of the sealed bids on a job, in plain words.
// Bids are labeled by the order they're shown (Bid A, B, ...) so the
// summary lines up with the list below it.
export function BidCompare({ jobId, bidIds, lang = 'en' }: { jobId: string; bidIds: string[]; lang?: string }) {
  const es = lang === 'es'
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const letter = (id: string) => {
    const i = bidIds.indexOf(id)
    return i >= 0 ? String.fromCharCode(65 + i) : '?'
  }
  const run = async () => {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/ai-assist/compare-bids', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) setError(d.error || 'Could not compare right now.')
    else setResult(d)
  }
  if (!result) {
    return (
      <div className="mb-4">
        <button onClick={run} disabled={busy} className="w-full rounded-xl border border-[#12A5A9]/35 bg-[#12A5A9]/10 text-[#12A5A9] text-sm font-semibold py-3 hover:bg-[#12A5A9]/15 disabled:opacity-60">
          {busy ? (es ? 'Comparando ofertas…' : 'Comparing bids…') : es ? '✦ Ayúdame a elegir' : '✦ Help me choose'}
        </button>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
    )
  }
  return (
    <div className="mb-4 rounded-2xl border border-[#12A5A9]/30 bg-gradient-to-br from-[#0A7B7E]/12 to-transparent p-4">
      <p className="text-[#12A5A9] text-[11px] font-semibold uppercase tracking-wider">✦ {es ? 'Comparación' : 'Comparison'}</p>
      <p className="text-white/85 text-sm mt-1.5 leading-relaxed">{result.summary}</p>
      {result.picks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {result.picks.map((p) => (
            <li key={p.bidId + p.label} className="flex gap-2.5 text-sm">
              <span className="shrink-0 w-7 h-7 rounded-lg bg-[#12A5A9]/20 text-[#12A5A9] font-bold flex items-center justify-center">{letter(p.bidId)}</span>
              <span><span className="text-white font-semibold">{p.label}.</span> <span className="text-white/65">{p.reason}</span></span>
            </li>
          ))}
        </ul>
      )}
      {result.watchFor.length > 0 && (
        <div className="mt-3">
          <p className="text-yellow-400 text-xs font-semibold">{es ? 'Ten en cuenta' : 'Watch for'}</p>
          <ul className="mt-1 space-y-0.5">{result.watchFor.map((w, i) => <li key={i} className="text-white/65 text-xs">• {w}</li>)}</ul>
        </div>
      )}
      {result.questions.length > 0 && (
        <div className="mt-3">
          <p className="text-white/50 text-xs font-semibold">{es ? 'Vale la pena preguntar' : 'Worth asking'}</p>
          <ul className="mt-1 space-y-0.5">{result.questions.map((q, i) => <li key={i} className="text-white/65 text-xs">• Bid {letter(q.bidId)}: {q.question}</li>)}</ul>
        </div>
      )}
      <p className="text-white/35 text-[11px] mt-3">{es ? 'Tú decides. Esto solo resume las ofertas.' : 'You decide. This only summarizes the bids.'}</p>
    </div>
  )
}
