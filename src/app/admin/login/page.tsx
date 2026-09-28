'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { AuthInput } from '@/components/AuthInput'
import { RippleButton } from '@/components/RippleButton'
import { MailIcon, LockIcon, ShieldIcon } from '@/components/icons'

// Deliberately its own page, not a variant of the consumer /login — same
// underlying Supabase Auth (no separate credential store to manage), but a
// distinct front door: no role picker, no marketing panel, nothing that
// reads as "sign up for Prophandld". Whether someone who signs in here is
// actually authorized is decided separately, by admin_users via
// /api/admin/check-access — this page only gets them signed in and then
// asks that question, it isn't itself the security boundary.
//
// MFA is mandatory for every admin account, not optional — an admin who's
// never enrolled gets walked through enrollment right here, on first
// login, rather than being let in without it. A password alone getting
// someone into billing/revenue/dispute data for the whole business isn't
// enough on its own.
type Step = 'credentials' | 'enroll' | 'challenge'

export default function AdminLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  const goToAdminOrSignOut = async () => {
    const res = await fetch('/api/admin/check-access')
    const check = await res.json().catch(() => ({ authorized: false }))
    if (!check.authorized) {
      await supabase.auth.signOut()
      setError('This account isn\'t authorized for admin access.')
      setStep('credentials')
      setLoading(false)
      return
    }
    fetch('/api/admin/log-login', { method: 'POST' }).catch(() => {})
    router.replace('/admin')
  }

  const startMfaStep = async () => {
    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const verifiedTotp = factorsData?.totp?.find((f) => f.status === 'verified')

    if (verifiedTotp) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === 'aal2') {
        await goToAdminOrSignOut()
        return
      }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id })
      if (challengeError || !challenge) {
        setError('Could not start the authenticator check. Try again.')
        setLoading(false)
        return
      }
      setFactorId(verifiedTotp.id)
      setStep('challenge')
      setLoading(false)
      return
    }

    // No verified factor yet — this account has to enroll before it can
    // get in. Clean up any half-finished enrollment from a previous
    // attempt (closed the tab before scanning/verifying) so re-enrolling
    // doesn't collide with a stale unverified factor of the same type.
    const unverified = factorsData?.totp?.filter((f) => f.status !== 'verified') || []
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }

    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (enrollError || !enrolled) {
      setError('Could not start authenticator setup. Try again.')
      setLoading(false)
      return
    }
    setFactorId(enrolled.id)
    setQrCode(enrolled.totp.qr_code)
    setSecret(enrolled.totp.secret)
    setStep('enroll')
    setLoading(false)
  }

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) {
      setError(loginError.message)
      setLoading(false)
      return
    }
    if (!data.user) {
      setError('Something went wrong signing in.')
      setLoading(false)
      return
    }

    const res = await fetch('/api/admin/check-access')
    const check = await res.json().catch(() => ({ authorized: false }))
    if (!check.authorized) {
      await supabase.auth.signOut()
      setError('This account isn\'t authorized for admin access.')
      setLoading(false)
      return
    }

    await startMfaStep()
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
      setError('That code didn\'t match. Check your authenticator app and try again.')
      setVerifying(false)
      return
    }

    await goToAdminOrSignOut()
  }

  if (step === 'enroll') {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
            <ShieldIcon className="w-4 h-4 text-white/50" />
          </div>
          <h1 className="text-white text-lg font-semibold mb-1">Set up an authenticator</h1>
          <p className="text-white/40 text-sm mb-6">
            Required once for this account. Scan with Google Authenticator, Authy, or any TOTP app.
          </p>
          {qrCode && (
            <div className="bg-white rounded-xl p-3 inline-block mb-4">
              <img src={qrCode} alt="Scan with your authenticator app" className="w-40 h-40" />
            </div>
          )}
          {secret && (
            <p className="text-white/30 text-xs mb-6 break-all">Can&apos;t scan? Enter this key manually: {secret}</p>
          )}
          <form onSubmit={handleVerify} className="text-left">
            <label className="text-white/70 text-sm block mb-1.5 text-center">Enter the code from your app</label>
            <AuthInput
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="text-center text-lg tracking-[0.3em] font-semibold"
            />
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
                {error}
              </div>
            )}
            <RippleButton
              type="submit"
              disabled={verifying || code.length === 0}
              className="w-full bg-white/8 hover:bg-white/12 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mt-3"
            >
              {verifying ? 'Verifying...' : 'Confirm and finish setup'}
            </RippleButton>
          </form>
        </div>
      </div>
    )
  }

  if (step === 'challenge') {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
            <ShieldIcon className="w-4 h-4 text-white/50" />
          </div>
          <h1 className="text-white text-lg font-semibold mb-1">Enter your authenticator code</h1>
          <p className="text-white/40 text-sm mb-6">From the app you set up for this account.</p>
          <form onSubmit={handleVerify} className="text-left">
            <AuthInput
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="text-center text-lg tracking-[0.3em] font-semibold"
            />
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
                {error}
              </div>
            )}
            <RippleButton
              type="submit"
              disabled={verifying || code.length === 0}
              className="w-full bg-white/8 hover:bg-white/12 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mt-3"
            >
              {verifying ? 'Verifying...' : 'Verify'}
            </RippleButton>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
            <LockIcon className="w-4 h-4 text-white/50" />
          </div>
          <h1 className="text-white text-lg font-semibold">Prophandld Admin</h1>
          <p className="text-white/40 text-sm mt-1">Staff access only.</p>
        </div>

        <form onSubmit={handleCredentials} className="space-y-3">
          <AuthInput
            icon={MailIcon}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <AuthInput
            icon={LockIcon}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          <RippleButton
            type="submit"
            disabled={loading}
            className="w-full bg-white/8 hover:bg-white/12 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </RippleButton>
        </form>
      </div>
    </div>
  )
}
