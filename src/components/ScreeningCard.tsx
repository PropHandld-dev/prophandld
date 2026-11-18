'use client'

import { useCallback, useEffect, useState } from 'react'

type Req = { id: string; applicant_name: string; applicant_email: string; status: string; note: string | null; created_at: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  invited: { label: 'Invited', cls: 'bg-white/8 text-white/60' },
  report_received: { label: 'Report received', cls: 'bg-blue-500/15 text-blue-300' },
  approved: { label: 'Approved', cls: 'bg-[#12A5A9]/15 text-[#12A5A9]' },
  declined: { label: 'Declined', cls: 'bg-red-500/15 text-red-400' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-white/8 text-white/40' },
}

// Applicant screening through TransUnion SmartMove: log the applicant, send
// them a heads-up, open SmartMove to start the request, and track the
// decision. Reports stay with SmartMove; we keep only the outcome.
export function ScreeningCard({ unitId }: { unitId: string }) {
  const [requests, setRequests] = useState<Req[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [declinedId, setDeclinedId] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/screening?unitId=${unitId}`).then((r) => r.json()).then((d) => setRequests(d.requests || [])).catch(() => {})
  }, [unitId])
  useEffect(() => { load() }, [load])

  const start = async () => {
    setSaving(true)
    setError(null)
    const res = await fetch('/api/screening', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, applicantName: name, applicantEmail: email }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setSaving(false)
    if (!res?.ok) {
      setError(d.error || 'Could not save.')
      return
    }
    window.open('https://www.mysmartmove.com/', '_blank', 'noopener,noreferrer')
    setOpen(false)
    setName('')
    setEmail('')
    load()
  }

  const setStatus = async (id: string, status: string) => {
    await fetch(`/api/screening/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).catch(() => null)
    if (status === 'declined') setDeclinedId(id)
    load()
  }

  const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[#12A5A9]'

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-white font-semibold">Applicant screening</h2>
        {!open && <button onClick={() => setOpen(true)} className="text-[#12A5A9] text-xs font-semibold hover:underline">+ Screen an applicant</button>}
      </div>
      <p className="text-white/50 text-sm">Credit, criminal and eviction checks through TransUnion SmartMove. The applicant pays and consents directly with SmartMove.</p>

      {open && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/4 p-4 space-y-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Applicant's full name" className={input} aria-label="Applicant name" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Applicant's email" className={input} aria-label="Applicant email" />
          <p className="text-white/45 text-xs leading-relaxed">We&apos;ll email the applicant what to expect and open SmartMove for you. Start the request there with the same email.</p>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={start} disabled={saving || !name.trim() || !email.trim()} className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40">{saving ? 'Saving…' : 'Continue to SmartMove'}</button>
            <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white text-sm">Cancel</button>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <ul className="mt-4 divide-y divide-white/6">
          {requests.map((r) => (
            <li key={r.id} className="py-3 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{r.applicant_name}</p>
                <p className="text-white/40 text-xs truncate">{r.applicant_email} · {new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS[r.status]?.cls}`}>{STATUS[r.status]?.label}</span>
              <button
                onClick={async () => {
                  if (!window.confirm(`Remove ${r.applicant_name} from this list?`)) return
                  await fetch(`/api/screening/${r.id}`, { method: 'DELETE' }).catch(() => null)
                  load()
                }}
                className="text-white/35 hover:text-red-400 text-xs"
                aria-label={`Remove ${r.applicant_name}`}
              >
                Remove
              </button>
              <select aria-label="Update status" value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}

      {declinedId && (
        <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/8 p-4">
          <p className="text-yellow-400 text-sm font-semibold">If the screening report affected your decision, you must send an adverse action notice</p>
          <p className="text-white/65 text-xs mt-1.5 leading-relaxed">
            Under the federal Fair Credit Reporting Act, tell the applicant in writing: that you declined (or asked for more, like a higher deposit) based on the report; the screening company&apos;s name, address and phone (TransUnion); that TransUnion didn&apos;t make the decision and can&apos;t explain it; and that they can get a free copy of their report within 60 days and dispute anything inaccurate. SmartMove can send this notice for you from your request.
          </p>
          <button onClick={() => setDeclinedId(null)} className="text-white/60 hover:text-white text-xs font-semibold mt-2">Got it</button>
        </div>
      )}
    </div>
  )
}
