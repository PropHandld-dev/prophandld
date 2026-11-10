'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CheckCircleIcon, LockIcon } from '@/components/icons'
import { SetupPaymentMethodModal } from '@/components/SetupPaymentMethodModal'
import { useLanguage, t } from '@/lib/i18n'

// A job can't open for bidding without the landlord having a card on file
// here (see api/landlord/jobs/[jobId]/start-bidding) — this is also what
// cron/unpaid-job-reminder charges automatically after 3 days unpaid if
// the landlord hasn't paid manually. Same reauth pattern as
// ZelleVenmoCashAppCard/payout changes: a first-time add needs no
// password (nothing to hijack yet), but replacing or removing an
// already-saved card does, since it's authorizing future unattended
// charges.
export function DefaultPaymentMethodCard() {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [reauthing, setReauthing] = useState<'replace' | 'remove' | null>(null)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthSubmitting, setReauthSubmitting] = useState(false)
  const [mfaRequired, setMfaRequired] = useState<'replace' | 'remove' | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSubmitting, setMfaSubmitting] = useState(false)

  const [setupSecret, setSetupSecret] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/stripe/default-payment-method')
      const data = await res.json()
      setLabel(data.paymentMethod?.label || null)
    } catch {
      // Leave blank — treated as "no card on file," same as actually having none.
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const startSetup = async (password?: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/default-payment-method/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 428 && data.error === 'mfa_required') {
          setMfaRequired('replace')
          setMfaCode('')
        } else if (res.status === 401) {
          setError(t('currentPasswordIncorrect', lang))
          setReauthing('replace')
        } else {
          setError(data.error || t('couldNotSavePrefix', lang))
        }
        return
      }
      setSetupSecret(data.clientSecret)
    } catch {
      setError(t('couldNotSavePrefix', lang))
    } finally {
      setBusy(false)
    }
  }

  const handleAddOrReplaceClick = async () => {
    setError(null)
    if (!label) {
      // First-time add — nothing to hijack, no reauth needed, same
      // distinction ZelleVenmoCashAppCard draws for a fresh handle.
      startSetup()
      return
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') {
      startSetup()
      return
    }
    if (aal?.nextLevel === 'aal2') {
      setMfaRequired('replace')
      setMfaCode('')
      return
    }
    setReauthing('replace')
  }

  const handleRemoveClick = async () => {
    setError(null)
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') {
      doRemove()
      return
    }
    if (aal?.nextLevel === 'aal2') {
      setMfaRequired('remove')
      setMfaCode('')
      return
    }
    setReauthing('remove')
  }

  const doRemove = async (password?: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/default-payment-method', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 428 && data.error === 'mfa_required') {
          setMfaRequired('remove')
          setMfaCode('')
        } else if (res.status === 401) {
          setError(t('currentPasswordIncorrect', lang))
          setReauthing('remove')
        } else {
          setError(data.error || t('couldNotSavePrefix', lang))
        }
        return
      }
      setLabel(null)
    } catch {
      setError(t('couldNotSavePrefix', lang))
    } finally {
      setBusy(false)
    }
  }

  const handleReauthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setReauthSubmitting(true)
    const password = reauthPassword
    const action = reauthing
    setReauthPassword('')
    setReauthing(null)
    if (action === 'remove') await doRemove(password)
    else await startSetup(password)
    setReauthSubmitting(false)
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mfaCode.trim().length === 0) return
    setMfaSubmitting(true)
    setError(null)

    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const factor = factorsData?.totp?.find((f) => f.status === 'verified')
    if (!factor) {
      setError(t('twoFactorVerifyChallengeError', lang))
      setMfaSubmitting(false)
      return
    }
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challengeError || !challenge) {
      setError(t('twoFactorVerifyChallengeError', lang))
      setMfaSubmitting(false)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: mfaCode.trim() })
    if (verifyError) {
      setError(t('twoFactorCodeMismatchError', lang))
      setMfaSubmitting(false)
      return
    }

    const action = mfaRequired
    setMfaRequired(null)
    setMfaCode('')
    if (action === 'remove') await doRemove()
    else await startSetup()
    setMfaSubmitting(false)
  }

  const handleSaved = async (setupIntentId: string) => {
    setSetupSecret(null)
    setBusy(true)
    try {
      const res = await fetch('/api/stripe/default-payment-method/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupIntentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setLabel(data.label || null)
      else setError(data.error || t('couldNotSavePrefix', lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-1">{t('defaultPaymentMethodTitle', lang)}</h2>
      <p className="text-white/50 text-sm mb-4">{t('defaultPaymentMethodBody', lang)}</p>

      {loading ? (
        <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
      ) : reauthing ? (
        <form onSubmit={handleReauthSubmit} className="space-y-3">
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <LockIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
            {t('reauthToChangeP2pTitle', lang)}
          </div>
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
              onClick={() => { setReauthing(null); setReauthPassword(''); setError(null) }}
              className="text-white/50 hover:text-white text-sm transition"
            >
              {t('cancel', lang)}
            </button>
          </div>
        </form>
      ) : mfaRequired ? (
        <form onSubmit={handleMfaSubmit} className="space-y-3">
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <LockIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
            {t('mfaStepUpTitle', lang)}
          </div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-center text-lg tracking-[0.3em] font-semibold placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-3">
            <RippleButton
              type="submit"
              disabled={mfaSubmitting || mfaCode.length === 0}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {mfaSubmitting ? t('verifyingDots', lang) : t('continueBtn', lang)}
            </RippleButton>
            <button
              type="button"
              onClick={() => { setMfaRequired(null); setMfaCode(''); setError(null) }}
              className="text-white/50 hover:text-white text-sm transition"
            >
              {t('cancel', lang)}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {label ? (
            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <span className="text-white text-sm font-medium">{label}</span>
              <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" />
            </div>
          ) : (
            <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-3">
              <p className="text-yellow-400/90 text-xs leading-relaxed">{t('noPaymentMethodOnFile', lang)}</p>
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <p className="text-white/50 text-xs leading-relaxed">{t('defaultPaymentMethodConsent', lang)}</p>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex items-center gap-3">
            <RippleButton
              onClick={handleAddOrReplaceClick}
              disabled={busy}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {label ? t('replaceCardBtn', lang) : t('addCardBtn', lang)}
            </RippleButton>
            {label && (
              <button
                type="button"
                onClick={handleRemoveClick}
                disabled={busy}
                className="text-white/50 hover:text-red-400 text-sm transition disabled:opacity-50"
              >
                {t('removeBtn', lang)}
              </button>
            )}
          </div>
        </div>
      )}

    </ScrollReveal>
    {/* Rendered as a sibling, not a child, of ScrollReveal on purpose —
        ScrollReveal applies a CSS transform (translate-y) once visible,
        and any transform on an ancestor breaks position:fixed for
        descendants, trapping this modal's overlay inside the card's own
        box instead of covering the viewport. Confirmed live: the Save
        button was unreachable/mis-targeted until this moved out. Every
        other Stripe payment modal in the app (StripePaymentModal) is
        already rendered at a page's top level for the same reason. */}
    {setupSecret && (
      <SetupPaymentMethodModal
        clientSecret={setupSecret}
        title={t('addCardModalTitle', lang)}
        note={t('defaultPaymentMethodConsent', lang)}
        onClose={() => setSetupSecret(null)}
        onSaved={handleSaved}
      />
    )}
    </>
  )
}
