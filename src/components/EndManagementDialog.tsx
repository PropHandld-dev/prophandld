'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Summary = {
  side: 'owner' | 'pm'
  status: string
  orgName: string
  ownerName: string
  managedSince: string | null
  rentToPm: boolean
  openJobs: { id: string; category: string; status: string; address: string }[]
  openJobsCount: number
  tenantCount: number
  unpaidFees: number
}

const REASONS: { key: string; owner: string; pm: string }[] = [
  { key: 'switching_managers', owner: 'Switching to another manager', pm: 'Client is switching managers' },
  { key: 'self_managing', owner: "I'll manage it myself", pm: 'Client will self-manage' },
  { key: 'selling', owner: 'Selling the property', pm: 'Property is being sold' },
  { key: 'service', owner: 'Service concerns', pm: 'We can no longer serve this client' },
  { key: 'pricing', owner: 'Cost', pm: 'Fee disagreement' },
  { key: 'other', owner: 'Something else', pm: 'Something else' },
]

// Ending a PM relationship the way it happens in the real world: see what's
// still open, answer the deposit question, choose whether tenants are told,
// then confirm. Used by the owner ("Remove manager") and the PM ("Remove
// client").
export function EndManagementDialog({ portfolioId, onClose, onEnded }: { portfolioId: string; onClose: () => void; onEnded: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [deposits, setDeposits] = useState<'yes' | 'no' | 'unsure' | null>(null)
  const [notifyTenants, setNotifyTenants] = useState(true)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/pm/clients/${portfolioId}/end`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Could not load details')
        setSummary(d)
      })
      .catch((e) => setLoadError(e.message))
  }, [portfolioId])

  const end = async () => {
    setEnding(true)
    setError(null)
    const res = await fetch(`/api/pm/clients/${portfolioId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, note, depositsHeld: deposits, notifyTenants }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setEnding(false)
    if (!res?.ok) {
      setError(data.error || 'Could not end management. Try again.')
      return
    }
    onEnded()
  }

  const other = summary ? (summary.side === 'owner' ? summary.orgName : summary.ownerName) : ''
  const pending = summary && summary.status !== 'accepted'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[#0F2138] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-6 motion-safe:animate-[floatUp_0.25s_ease-out]">
        {!summary ? (
          <div className="py-10 text-center text-white/50 text-sm">{loadError || 'Loading…'}</div>
        ) : pending ? (
          <>
            <h3 className="text-white font-semibold text-lg">Cancel this {summary.side === 'owner' ? 'request' : 'invite'}?</h3>
            <p className="text-white/55 text-sm mt-1">Nothing has been managed yet, so nothing else changes.</p>
            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
            <div className="flex items-center gap-3 mt-6">
              <button onClick={end} disabled={ending} className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50">{ending ? 'Cancelling…' : 'Cancel it'}</button>
              <button onClick={onClose} className="text-white/50 hover:text-white text-sm">Keep</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-white font-semibold text-lg">End management with {other}</h3>
            <p className="text-white/55 text-sm mt-1">
              {summary.managedSince ? `Managed since ${new Date(summary.managedSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}. ` : ''}
              This takes effect now. If your agreement has a notice period, end it here on the final day.
            </p>

            <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mt-6 mb-2">What happens</p>
            <ul className="space-y-2">
              <li className="rounded-xl bg-white/4 border border-white/8 px-3.5 py-3 text-sm">
                <p className="text-white font-medium">
                  {summary.openJobsCount > 0 ? `${summary.openJobsCount} unfinished job${summary.openJobsCount === 1 ? '' : 's'} (open or in progress)` : 'No unfinished jobs'}
                </p>
                <p className="text-white/50 text-xs mt-0.5">
                  {summary.side === 'owner' ? 'They stay as they are; you approve and pay them from now on.' : `They stay with ${summary.ownerName}, who approves and pays them from now on.`}
                </p>
                {summary.openJobs.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {summary.openJobs.slice(0, 4).map((j) => (
                      <li key={j.id} className="text-white/60 text-xs truncate">• {j.category} <span className="text-white/35">· {j.address}</span></li>
                    ))}
                  </ul>
                )}
              </li>
              <li className="rounded-xl bg-white/4 border border-white/8 px-3.5 py-3 text-sm">
                <p className="text-white font-medium">Rent</p>
                <p className="text-white/50 text-xs mt-0.5">
                  {summary.rentToPm
                    ? `Rent was going to ${summary.orgName}. From now on it goes straight to ${summary.side === 'owner' ? 'your' : `${summary.ownerName}'s`} own account.`
                    : `Keeps going straight to ${summary.side === 'owner' ? 'your' : `${summary.ownerName}'s`} account, as it does now.`}
                </p>
              </li>
              <li className="rounded-xl bg-white/4 border border-white/8 px-3.5 py-3 text-sm">
                <p className="text-white font-medium">Management fees</p>
                <p className="text-white/50 text-xs mt-0.5">
                  {summary.unpaidFees > 0
                    ? `$${summary.unpaidFees.toFixed(2)} is unpaid. Settle it between you; nothing more will be charged.`
                    : 'Nothing more will be charged. Paid fees stay in your records.'}
                </p>
              </li>
              <li className="rounded-xl bg-white/4 border border-white/8 px-3.5 py-3 text-sm">
                <p className="text-white font-medium">Access and records</p>
                <p className="text-white/50 text-xs mt-0.5">
                  {summary.side === 'owner' ? `${summary.orgName}'s team loses access right away.` : `Your team loses access to ${summary.ownerName}'s properties right away.`}{' '}
                  Payment history, jobs and documents stay in Prophandld.{' '}
                  <Link href="/landlord/records" className="text-[#12A5A9] font-semibold hover:underline">Download records first</Link>
                </p>
              </li>
            </ul>

            <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mt-6 mb-2">
              Does {summary.orgName} hold any security deposits for the tenants?
            </p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
              {(['yes', 'no', 'unsure'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={deposits === v}
                  onClick={() => setDeposits(v)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition ${deposits === v ? 'bg-[#12A5A9] border-[#12A5A9] text-white' : 'bg-white/4 border-white/10 text-white/70 hover:text-white'}`}
                >
                  {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not sure'}
                </button>
              ))}
            </div>
            {(deposits === 'yes' || deposits === 'unsure') && (
              <p className="text-yellow-400/90 text-xs mt-2 leading-relaxed">
                {summary.orgName} should hand any deposits over to {summary.ownerName} with a written accounting. We&apos;ll put this in the confirmation email to both of you.
              </p>
            )}

            {summary.tenantCount > 0 && (
              <label className="flex items-start gap-3 mt-5 rounded-xl bg-white/4 border border-white/8 px-3.5 py-3 cursor-pointer">
                <input type="checkbox" checked={notifyTenants} onChange={(e) => setNotifyTenants(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#12A5A9]" />
                <span className="text-sm">
                  <span className="text-white font-medium block">Let {summary.tenantCount === 1 ? 'the tenant' : `all ${summary.tenantCount} tenants`} know</span>
                  <span className="text-white/50 text-xs">They&apos;ll get a short note that {summary.ownerName} is now their contact.</span>
                </span>
              </label>
            )}

            <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mt-6 mb-2">Reason (optional)</p>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(reason === r.key ? null : r.key)}
                  className={`text-xs rounded-full px-3 py-1.5 border transition ${reason === r.key ? 'bg-white/12 border-white/30 text-white' : 'bg-white/4 border-white/10 text-white/60 hover:text-white'}`}
                >
                  {summary.side === 'owner' ? r.owner : r.pm}
                </button>
              ))}
            </div>
            {reason && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Anything you'd like to add (only Prophandld sees this)"
                className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[#12A5A9]"
              />
            )}

            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={end}
                disabled={ending || deposits === null}
                className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-xl hover:bg-red-600 transition disabled:opacity-40"
              >
                {ending ? 'Ending…' : 'End management'}
              </button>
              <button onClick={onClose} disabled={ending} className="text-white/50 hover:text-white text-sm">Keep</button>
            </div>
            {deposits === null && <p className="text-white/40 text-xs mt-2">Answer the deposit question to continue.</p>}
            <p className="text-white/35 text-xs mt-3">You can work together again anytime with a new invite.</p>
          </>
        )}
      </div>
    </div>
  )
}
