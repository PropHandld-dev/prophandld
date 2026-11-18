'use client'

import { useState } from 'react'

const post = async (body: Record<string, unknown>) => {
  const res = await fetch('/api/pm/rent-routing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = res ? await res.json().catch(() => ({})) : {}
  return { ok: !!res?.ok, data }
}

// PM side, one per client: who gets this client's rent, and the request.
export function PmRentRow({
  portfolioId,
  ownerName,
  rentRecipient,
  requested,
  attested,
  onChanged,
}: {
  portfolioId: string
  ownerName: string
  rentRecipient: 'owner' | 'pm'
  requested: boolean
  attested: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAttest, setShowAttest] = useState(false)
  const first = ownerName.split(' ')[0] || ownerName

  const act = async (action: 'request' | 'stop') => {
    if (action === 'request' && !attested) {
      setShowAttest(true)
      return
    }
    setBusy(true)
    setError(null)
    const { ok, data } = await post({ action, portfolioId })
    setBusy(false)
    if (!ok) {
      if (data.needsAttest) setShowAttest(true)
      setError(data.error || 'Could not save. Try again.')
      return
    }
    onChanged()
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-3 mt-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-white/45 text-[11px] font-semibold uppercase tracking-wide">Rent goes to</p>
          <p className="text-white text-sm font-semibold mt-0.5">
            {rentRecipient === 'pm' ? 'Your company account' : `${first} directly`}
          </p>
          {requested && rentRecipient !== 'pm' && <p className="text-yellow-400/90 text-xs mt-0.5">Waiting for {first} to approve</p>}
        </div>
        {rentRecipient === 'pm' ? (
          <button type="button" onClick={() => act('stop')} disabled={busy} className="text-white/55 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-white/5 transition disabled:opacity-50">
            Send to {first} instead
          </button>
        ) : requested ? (
          <button type="button" onClick={() => act('stop')} disabled={busy} className="text-white/55 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-white/5 transition disabled:opacity-50">
            Cancel request
          </button>
        ) : (
          <button type="button" onClick={() => act('request')} disabled={busy} className="text-[#12A5A9] text-sm font-semibold px-3 py-2 rounded-lg hover:bg-[#12A5A9]/10 transition disabled:opacity-50">
            Collect rent for {first}
          </button>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {showAttest && (
        <TrustAttestDialog
          onClose={() => setShowAttest(false)}
          onDone={async () => {
            setShowAttest(false)
            setBusy(true)
            const { ok, data } = await post({ action: 'request', portfolioId })
            setBusy(false)
            if (!ok) setError(data.error || 'Could not send the request.')
            onChanged()
          }}
        />
      )}
    </div>
  )
}

const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')

export function TrustAttestDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [license, setLicense] = useState('')
  const [state, setState] = useState('PA')
  const [trust, setTrust] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setSaving(true)
    setError(null)
    const { ok, data } = await post({ action: 'attest', brokerLicenseNumber: license, brokerLicenseState: state, trustAccount: trust })
    setSaving(false)
    if (!ok) {
      setError(data.error || 'Could not save.')
      return
    }
    onDone()
  }
  const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9]'
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[#0F2138] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-6">
        <h3 className="text-white font-semibold text-lg">Before you collect rent for clients</h3>
        <p className="text-white/55 text-sm mt-1 leading-relaxed">
          In most states, collecting rent for someone else requires a real estate broker license, and the money has to sit in a separate trust or escrow account. Owners see what you enter here before they approve.
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-2.5 mt-5">
          <div>
            <label htmlFor="broker-license" className="text-white/60 text-xs block mb-1">Broker license number</label>
            <input id="broker-license" value={license} onChange={(e) => setLicense(e.target.value)} maxLength={40} placeholder="RB123456" className={input} />
          </div>
          <div>
            <label htmlFor="broker-state" className="text-white/60 text-xs block mb-1">State</label>
            <select id="broker-state" value={state} onChange={(e) => setState(e.target.value)} className={input}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-start gap-3 mt-4 cursor-pointer">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#12A5A9]" />
          <span className="text-white/75 text-sm leading-relaxed">
            The bank account our payouts go to is a trust or escrow account for client funds, and we pay owners out under our management agreements.
          </span>
        </label>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <div className="flex items-center gap-3 mt-6">
          <button type="button" onClick={save} disabled={saving || !trust || license.trim().length < 3} className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl disabled:opacity-40">
            {saving ? 'Saving…' : 'Confirm and send request'}
          </button>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-sm">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// Owner side: where their rent goes, and the PM's request to collect it.
export function OwnerRentRouting({
  portfolioId,
  orgName,
  rentRecipient,
  requested,
  brokerLicense,
  trustAccountAttested,
  onChanged,
}: {
  portfolioId: string
  orgName: string
  rentRecipient: 'owner' | 'pm'
  requested: boolean
  brokerLicense: string | null
  trustAccountAttested: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const decide = async (action: 'approve' | 'decline' | 'revoke') => {
    setBusy(action)
    setError(null)
    const { ok, data } = await post({ action, portfolioId })
    setBusy(null)
    if (!ok) {
      setError(data.error || 'Could not save. Try again.')
      return
    }
    onChanged()
  }

  if (requested && rentRecipient !== 'pm') {
    return (
      <div className="rounded-2xl border border-[#12A5A9]/35 bg-[#12A5A9]/8 p-4 mt-4">
        <p className="text-white font-semibold">{orgName} asks to collect your rent</p>
        <p className="text-white/60 text-sm mt-1 leading-relaxed">
          Tenants&apos; payments would go to {orgName}&apos;s account and they pay you out under your agreement. Until you approve, rent keeps coming straight to you. You can switch back anytime.
        </p>
        <ul className="mt-3 space-y-1 text-xs">
          <li className={brokerLicense ? 'text-[#12A5A9]' : 'text-yellow-400'}>{brokerLicense ? `✓ Broker license ${brokerLicense}` : '✕ No broker license on file'}</li>
          <li className={trustAccountAttested ? 'text-[#12A5A9]' : 'text-yellow-400'}>{trustAccountAttested ? '✓ Confirmed rent is held in a trust or escrow account' : '✕ Trust account not confirmed'}</li>
        </ul>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <div className="flex items-center gap-2.5 mt-4">
          <button type="button" onClick={() => decide('approve')} disabled={!!busy || !brokerLicense || !trustAccountAttested} className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40">
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button type="button" onClick={() => decide('decline')} disabled={!!busy} className="text-white/60 hover:text-white text-sm px-3 py-2.5">
            {busy === 'decline' ? 'Declining…' : 'Keep rent coming to me'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-4 border-t border-white/8">
      <div className="text-sm">
        <p className="text-white/45 text-[11px] font-semibold uppercase tracking-wide">Rent goes to</p>
        <p className="text-white font-medium mt-0.5">
          {rentRecipient === 'pm' ? `${orgName}${brokerLicense ? ` (license ${brokerLicense})` : ''}` : 'You, directly'}
        </p>
      </div>
      {rentRecipient === 'pm' && (
        <button type="button" onClick={() => decide('revoke')} disabled={!!busy} className="text-white/55 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-white/5 disabled:opacity-50">
          {busy ? 'Saving…' : 'Send rent to me instead'}
        </button>
      )}
      {error && <p className="text-red-400 text-xs w-full">{error}</p>}
    </div>
  )
}
