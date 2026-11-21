'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLanguage, t } from '@/lib/i18n'
import { useConfirm } from '@/lib/useConfirm'

type Req = { id: string; applicant_name: string; applicant_email: string; status: string; note: string | null; created_at: string }

const STATUS: Record<string, { label: Parameters<typeof t>[0]; cls: string }> = {
  invited: { label: 'scrInvited', cls: 'bg-white/8 text-white/60' },
  report_received: { label: 'scrReportReceived', cls: 'bg-blue-500/15 text-blue-300' },
  approved: { label: 'scrApproved', cls: 'bg-[#12A5A9]/15 text-[#12A5A9]' },
  declined: { label: 'scrDeclined', cls: 'bg-red-500/15 text-red-400' },
  withdrawn: { label: 'scrWithdrawn', cls: 'bg-white/8 text-white/40' },
}

// Applicant screening through TransUnion SmartMove: log the applicant, send
// them a heads-up, open SmartMove to start the request, and track the
// decision. Reports stay with SmartMove; we keep only the outcome.
export function ScreeningCard({ unitId }: { unitId: string }) {
  const lang = useLanguage()
  const { confirm, ConfirmDialog } = useConfirm()
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
    // Opened during the tap itself: a window opened after the save
    // finishes is blocked as a pop-up on iPhone/Safari.
    const tab = window.open('about:blank', '_blank')
    setSaving(true)
    setError(null)
    const res = await fetch('/api/screening', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, applicantName: name, applicantEmail: email }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setSaving(false)
    if (!res?.ok) {
      tab?.close()
      setError(d.error || t('scrCouldNotSave', lang))
      return
    }
    if (tab) {
      tab.opener = null
      tab.location.href = 'https://www.mysmartmove.com/'
    } else {
      window.location.href = 'https://www.mysmartmove.com/'
    }
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
      {ConfirmDialog}
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-white font-semibold">{t('scrTitle', lang)}</h2>
        {!open && <button onClick={() => setOpen(true)} className="text-[#12A5A9] text-xs font-semibold hover:underline">{t('scrAdd', lang)}</button>}
      </div>
      <p className="text-white/50 text-sm">{t('scrIntro', lang)}</p>

      {open && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/4 p-4 space-y-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('scrNamePh', lang)} className={input} aria-label={t('scrNamePh', lang)} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t('scrEmailPh', lang)} className={input} aria-label={t('scrEmailPh', lang)} />
          <p className="text-white/45 text-xs leading-relaxed">{t('scrHowItWorks', lang)}</p>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={start} disabled={saving || !name.trim() || !email.trim()} className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40">{saving ? t('scrSaving', lang) : t('scrContinue', lang)}</button>
            <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white text-sm">{t('cancel', lang)}</button>
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
              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS[r.status]?.cls}`}>{STATUS[r.status] ? t(STATUS[r.status].label, lang) : r.status}</span>
              <button
                onClick={async () => {
                  if (!(await confirm({ body: t('scrRemoveConfirm', lang).replace('{name}', r.applicant_name), confirmLabel: t('remove', lang), danger: true }))) return
                  await fetch(`/api/screening/${r.id}`, { method: 'DELETE' }).catch(() => null)
                  load()
                }}
                className="text-white/35 hover:text-red-400 text-xs"
                aria-label={`${t('remove', lang)} ${r.applicant_name}`}
              >
                {t('remove', lang)}
              </button>
              <select aria-label={t('scrUpdateStatus', lang)} value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.label, lang)}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}

      {declinedId && (
        <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/8 p-4">
          <p className="text-yellow-400 text-sm font-semibold">{t('scrAdverseTitle', lang)}</p>
          <p className="text-white/65 text-xs mt-1.5 leading-relaxed">
            {t('scrAdverseBody', lang)}
          </p>
          <button onClick={() => setDeclinedId(null)} className="text-white/60 hover:text-white text-xs font-semibold mt-2">{t('scrGotIt', lang)}</button>
        </div>
      )}
    </div>
  )
}
