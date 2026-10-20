'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CheckCircleIcon, LockIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

// Sits next to StripeConnectCard in the same "Get paid rent" section —
// same visual shell, different purpose: this never touches a payment
// processor at all. A renter sends money directly to one of these handles
// (see renter/rent/page.tsx), and the landlord's own existing "Mark
// received" flow stays the only thing that actually confirms it arrived.
// All three fields are optional and independent; a landlord who sets none
// changes nothing for their renters.
//
// Unlike Stripe/Dwolla, nothing here verifies a handle actually belongs to
// the landlord — it's plain text. That makes editing an already-set handle
// the single easiest payment destination in the app to silently redirect
// (stolen password, unattended device), so saving a CHANGE (not a
// first-time add — nothing to hijack there) goes through
// api/profile/p2p-handles instead of a direct client update: it requires
// re-entering your password first, then freezes the changed handle(s) from
// showing to renters for 48 hours and emails/pushes an alert, the same
// freeze-and-alert pattern already used for Stripe/Dwolla payout changes.
export function ZelleVenmoCashAppCard() {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zelle, setZelle] = useState('')
  const [venmo, setVenmo] = useState('')
  const [cashapp, setCashapp] = useState('')
  const [original, setOriginal] = useState({ zelle: '', venmo: '', cashapp: '' })
  const [frozenUntil, setFrozenUntil] = useState<string | null>(null)
  const [reauthing, setReauthing] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthSubmitting, setReauthSubmitting] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/profile/p2p-handles')
      const data = await res.json()
      setZelle(data.zelle || '')
      setVenmo(data.venmo || '')
      setCashapp(data.cashapp || '')
      setOriginal({ zelle: data.zelle || '', venmo: data.venmo || '', cashapp: data.cashapp || '' })
      setFrozenUntil(data.frozenUntil || null)
    } catch {
      // Leave fields blank rather than claim nothing is set — the save
      // button still works, it'll just be treated as a fresh add.
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Only changing an already-set handle is a redirection risk — same
  // distinction DwollaConnectCard makes before gating a re-link behind
  // password re-entry.
  const isChange =
    (!!original.zelle && original.zelle !== zelle.trim()) ||
    (!!original.venmo && original.venmo !== venmo.trim()) ||
    (!!original.cashapp && original.cashapp !== cashapp.trim())

  // Password is only ever sent over HTTPS to this app's own API route,
  // which re-verifies it server-side (see api/profile/p2p-handles) rather
  // than trusting that the client only called this after a real check —
  // a client-side-only gate can't stop someone calling the route directly
  // with a stolen session token, no password required.
  const doSave = async (password?: string) => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/profile/p2p-handles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zelle, venmo, cashapp, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401 && isChange) {
          setError(t('currentPasswordIncorrect', lang))
          setReauthing(true)
        } else {
          setError(data.error || t('couldNotSavePrefix', lang))
        }
        return
      }
      setOriginal({ zelle: zelle.trim(), venmo: venmo.trim(), cashapp: cashapp.trim() })
      if (data.frozenUntil) setFrozenUntil(data.frozenUntil)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError(t('couldNotSavePrefix', lang))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveClick = () => {
    if (isChange) {
      setError(null)
      setReauthing(true)
      return
    }
    doSave()
  }

  const handleReauthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setReauthSubmitting(true)
    const password = reauthPassword
    setReauthPassword('')
    setReauthing(false)
    await doSave(password)
    setReauthSubmitting(false)
  }

  const isFrozen = !!frozenUntil && new Date(frozenUntil) > new Date()

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-1">{t('p2pCardTitle', lang)}</h2>
      <p className="text-white/50 text-sm mb-4">{t('p2pCardBody', lang)}</p>

      {loading ? (
        <div className="space-y-2.5">
          <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
        </div>
      ) : reauthing ? (
        <form onSubmit={handleReauthSubmit} className="space-y-3">
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <LockIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
            {t('reauthToChangeP2pTitle', lang)}
          </div>
          <p className="text-white/50 text-xs">{t('reauthToChangeP2pBody', lang)}</p>
          <input
            type="password"
            value={reauthPassword}
            onChange={(e) => setReauthPassword(e.target.value)}
            placeholder={t('currentPasswordPlaceholder', lang)}
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-3">
            <RippleButton
              type="submit"
              disabled={reauthSubmitting || !reauthPassword}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {reauthSubmitting ? t('verifyingDots', lang) : t('continueBtn', lang)}
            </RippleButton>
            <button
              type="button"
              onClick={() => { setReauthing(false); setReauthPassword(''); setError(null) }}
              className="text-white/50 hover:text-white text-sm transition"
            >
              {t('cancel', lang)}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {isFrozen && (
            <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-3">
              <p className="text-yellow-400/90 text-xs leading-relaxed" suppressHydrationWarning>
                {t('p2pFrozenNotice', lang)} {new Date(frozenUntil!).toLocaleString()}.
              </p>
            </div>
          )}

          <div>
            <label className="text-white/70 text-xs font-semibold block mb-1.5">{t('p2pZelleLabel', lang)}</label>
            <input
              type="text"
              value={zelle}
              onChange={(e) => setZelle(e.target.value)}
              placeholder={t('p2pZellePlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-xs font-semibold block mb-1.5">{t('p2pVenmoLabel', lang)}</label>
            <input
              type="text"
              value={venmo}
              onChange={(e) => setVenmo(e.target.value)}
              placeholder={t('p2pVenmoPlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-xs font-semibold block mb-1.5">{t('p2pCashAppLabel', lang)}</label>
            <input
              type="text"
              value={cashapp}
              onChange={(e) => setCashapp(e.target.value)}
              placeholder={t('p2pCashAppPlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-3">
            <p className="text-yellow-400/90 text-xs leading-relaxed">{t('p2pRiskDisclosure', lang)}</p>
          </div>

          <p className="text-white/40 text-xs">{t('p2pChangeProtectionNote', lang)}</p>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex items-center gap-3">
            <RippleButton
              onClick={handleSaveClick}
              disabled={saving}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? t('savingDots', lang) : t('saveBtn', lang)}
            </RippleButton>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[#12A5A9] text-xs font-semibold">
                <CheckCircleIcon className="w-3.5 h-3.5" />
                {t('savedLabel', lang)}
              </span>
            )}
          </div>
        </div>
      )}
    </ScrollReveal>
  )
}
