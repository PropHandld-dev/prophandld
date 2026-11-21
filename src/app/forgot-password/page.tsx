'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { AuthLayout } from '@/components/AuthLayout'
import { AuthInput } from '@/components/AuthInput'
import { MailIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const requestReset = async () => {
    const res = await fetch('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null)
    return !!res?.ok
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const ok = await requestReset()
    if (!ok) {
      setError(t('fpServerUnreachable', lang))
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  const handleResend = async () => {
    if (resendState === 'sending') return
    setResendState('sending')
    const ok = await requestReset()
    if (!ok) {
      setOtpError(t('fpResendFailed', lang))
      setResendState('idle')
      return
    }
    setResendState('sent')
  }

  // A typed code instead of relying on the email's link alone — same fix
  // already applied to signup confirmation, here for the same reason: a
  // real, repeated report of the link failing on first click (most likely
  // an email client's own link-prescanning silently using up a single-use
  // link before a human ever gets to it). A code has nothing for that to
  // consume. Success lands directly on /reset-password already signed in
  // via the recovery session this just established — no second click
  // needed, and no dependency on the email link working at all.
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otpCode.trim().length === 0) return
    setVerifying(true)
    setOtpError(null)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otpCode.trim(),
      type: 'recovery',
    })

    if (verifyError) {
      setOtpError(
        verifyError.name === 'AuthRetryableFetchError'
          ? t('fpServerUnreachable', lang)
          : t('fpCodeDidntWork', lang)
      )
      setVerifying(false)
      return
    }

    router.replace('/reset-password')
  }

  if (sent) {
    return (
      <AuthLayout headline={t('fpAlmostThere', lang)} subtext={t('fpOneMoreStep', lang)}>
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mx-auto mb-5">
            <MailIcon className="w-6 h-6 text-[#12A5A9]" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">{t('fpCheckEmail', lang)}</h2>
          <p className="text-white/60 text-sm mb-1">{t('fpSentCodeTo', lang)}</p>
          <p className="text-white font-semibold mb-5">{email}</p>

          <form onSubmit={handleVerifyCode} className="text-left mb-6">
            <label className="text-white/70 text-sm block mb-1.5 text-center">{t('fpEnterCode', lang)}</label>
            <AuthInput
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder={t('fpCodePlaceholder', lang)}
              className="text-center text-lg tracking-[0.3em] font-semibold"
            />
            {otpError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
                {otpError}
              </div>
            )}
            <RippleButton
              type="submit"
              disabled={verifying || otpCode.length === 0}
              className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50 mt-3"
            >
              {verifying ? t('fpVerifying', lang) : t('fpVerify', lang)}
            </RippleButton>
          </form>

          <p className="text-white/50 text-sm mb-4">
            {t('fpOrClickLink', lang)}
          </p>
          <RippleButton
            type="button"
            onClick={handleResend}
            disabled={resendState === 'sending'}
            className="text-[#12A5A9] text-sm font-semibold hover:underline disabled:opacity-50"
          >
            {resendState === 'sent' ? t('fpSentAgain', lang) : resendState === 'sending' ? t('fpSending', lang) : t('fpResend', lang)}
          </RippleButton>

          <div className="mt-8 space-y-2">
            <button
              type="button"
              onClick={() => { setSent(false); setOtpCode(''); setOtpError(null); setResendState('idle') }}
              className="block mx-auto text-white/50 text-xs hover:text-white transition"
            >
              {t('fpWrongEmail', lang)}
            </button>
            {/* Shown unconditionally, regardless of whether this email actually
                has an account — same reason the page never confirms or denies
                that either way. Without this, someone who genuinely has no
                account gets stuck here forever: no code ever arrives, and
                nothing on this screen points them toward signing up instead. */}
            <Link href="/signup" className="block text-center text-white/50 text-xs hover:text-white transition">
              {t('fpNoAccount', lang)}
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      headline={t('fpHeadline', lang)}
      subtext={t('fpSubtext', lang)}
    >
      <div className="text-center mb-8 lg:text-left">
        <h1 className="text-2xl font-bold text-white">{t('fpTitle', lang)}</h1>
        <p className="text-white/50 text-sm mt-1">{t('fpWeEmailCode', lang)}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-white/70 text-sm block mb-1">{t('fpEmailLabel', lang)}</label>
          <AuthInput
            icon={MailIcon}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <RippleButton
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? t('fpSending', lang) : t('fpSendCode', lang)}
        </RippleButton>

        <Link href="/login" className="block text-center text-white/60 hover:text-white text-sm transition">
          {t('fpBackToLogin', lang)}
        </Link>
      </form>
    </AuthLayout>
  )
}
