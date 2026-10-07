'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RippleButton } from '@/components/RippleButton'

// Optional MFA for any role — admin already has this mandatory
// (src/app/admin/login/page.tsx), this is the same Supabase Auth TOTP
// API, just opt-in and managed from Profile instead of forced at every
// sign-in. Login-time enforcement lives in src/app/login/page.tsx: it
// only ever challenges an account that has a verified factor here.
type Status = 'loading' | 'off' | 'enrolling' | 'on'

export function TwoFactorAuthCard() {
  const [status, setStatus] = useState<Status>('loading')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    const verified = data?.totp?.find((f) => f.status === 'verified')
    if (verified) {
      setFactorId(verified.id)
      setStatus('on')
    } else {
      setStatus('off')
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  const handleEnable = async () => {
    setError(null)
    // Clean up any half-finished enrollment from a previous attempt
    // (closed the tab before scanning/verifying) — same reasoning as the
    // admin login page, so re-enrolling doesn't collide with a stale
    // unverified factor. listFactors() reads from the cached session/JWT,
    // not a live server query, so a factor created after this session's
    // last refresh is invisible to it unless we refresh first — without
    // this, the cleanup silently finds nothing and enroll() below fails
    // every time with a 422 mfa_factor_name_conflict.
    await supabase.auth.refreshSession()
    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const unverified = factorsData?.totp?.filter((f) => f.status !== 'verified') || []
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }

    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (enrollError || !enrolled) {
      setError('Could not start authenticator setup. Try again.')
      return
    }
    setFactorId(enrolled.id)
    setQrCode(enrolled.totp.qr_code)
    setSecret(enrolled.totp.secret)
    setCode('')
    setStatus('enrolling')
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId || code.trim().length === 0) return
    setVerifying(true)
    setError(null)

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError || !challenge) {
      setError('Could not verify that code. Try again.')
      setVerifying(false)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
    if (verifyError) {
      setError("That code didn't match. Check your authenticator app and try again.")
      setVerifying(false)
      return
    }

    setVerifying(false)
    setStatus('on')
  }

  const handleDisable = async () => {
    if (!factorId) return
    if (!window.confirm('Turn off two-factor authentication? Your account will only need a password to sign in from then on.')) return
    setDisabling(true)
    setError(null)
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId })
    if (unenrollError) {
      setError('Could not turn off two-factor authentication. Try again.')
      setDisabling(false)
      return
    }
    setFactorId(null)
    setDisabling(false)
    setStatus('off')
  }

  if (status === 'loading') return null

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-2">Two-factor authentication</h2>
      <p className="text-white/60 text-sm mb-4">
        Add a second step at sign-in with an authenticator app (Google Authenticator, Authy, or similar) — optional, on top of your password.
      </p>

      {status === 'off' && (
        <RippleButton
          onClick={handleEnable}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-3 rounded-xl hover:opacity-90 transition"
        >
          Set up two-factor authentication
        </RippleButton>
      )}

      {status === 'on' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[#12A5A9] text-sm font-medium">Enabled</p>
          <button
            onClick={handleDisable}
            disabled={disabling}
            className="text-white/60 hover:text-red-400 text-xs font-semibold transition disabled:opacity-50"
          >
            {disabling ? 'Turning off…' : 'Turn off'}
          </button>
        </div>
      )}

      {status === 'enrolling' && (
        <div>
          <p className="text-white/50 text-sm mb-4">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
          {qrCode && (
            <div className="bg-white rounded-xl p-3 inline-block mb-3">
              <img src={qrCode} alt="Scan with your authenticator app" className="w-36 h-36" />
            </div>
          )}
          {secret && (
            <p className="text-white/40 text-xs mb-4 break-all">Can&apos;t scan? Enter this key manually: {secret}</p>
          )}
          <form onSubmit={handleVerify} className="flex gap-2 items-start">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 text-center text-lg tracking-[0.3em] font-semibold focus:outline-none focus:border-[#12A5A9] transition"
            />
            <RippleButton
              type="submit"
              disabled={verifying || code.length === 0}
              className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {verifying ? 'Verifying…' : 'Confirm'}
            </RippleButton>
          </form>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
          {error}
        </div>
      )}
    </div>
  )
}
