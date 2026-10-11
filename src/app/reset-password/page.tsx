'use client'

import { useState, useEffect } from 'react'
import { supabase, consumeAuthError } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { RippleButton } from '@/components/RippleButton'
import { AuthLayout } from '@/components/AuthLayout'
import { AuthInput } from '@/components/AuthInput'
import { LockIcon, CheckCircleIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

export default function ResetPasswordPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // A rejected recovery link (expired, or already used — including by an
    // email client's own link-prescan/safe-link check silently visiting it
    // before the person ever clicks) redirects back with the real reason in
    // the URL hash, captured by consumeAuthError() the instant this module
    // loads. This used to go unread here — unlike /login, which already
    // reads it the same way — so a rejected link always fell through to a
    // 4-second poll timeout and the same generic message regardless of
    // what actually happened, with no way to tell "already used" apart
    // from anything else.
    const authError = consumeAuthError()
    if (authError) {
      setError(
        authError.code === 'otp_expired'
          ? t('resetLinkAlreadyUsed', lang)
          : authError.description?.replace(/\+/g, ' ') || t('resetLinkInvalidOrExpired', lang)
      )
      return
    }

    let attempts = 0

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setReady(true)
        return
      }

      attempts++
      if (attempts < 10) {
        setTimeout(checkSession, 400)
      } else {
        setError(t('resetLinkInvalidOrExpired', lang))
      }
    }

    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true)
        setError(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError(t('resetPasswordsDoNotMatch', lang))
      return
    }

    if (password.length < 8) {
      setError(t('resetPasswordMinLength', lang))
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.replace('/login'), 2000)
    setLoading(false)
  }

  return (
    <AuthLayout
      headline={t('almostThereHeadline', lang)}
      subtext={t('pickNewPasswordSubtext', lang)}
    >
      <div className="text-center mb-8 lg:text-left">
        <h1 className="text-2xl font-bold text-white">{t('setNewPasswordHeading', lang)}</h1>
        <p className="text-white/50 text-sm mt-1">{t('chooseStrongPassword', lang)}</p>
      </div>

      {done ? (
        <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-6 py-5 text-center">
          <CheckCircleIcon className="w-6 h-6 text-[#12A5A9] mx-auto mb-2" />
          <p className="text-[#12A5A9] font-medium">{t('passwordUpdatedBang', lang)}</p>
          <p className="text-white/50 text-sm mt-1">{t('redirectingToLogin', lang)}</p>
        </div>
      ) : error && !ready ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
          {error}
          <a href="/forgot-password" className="block mt-3 text-[#12A5A9] hover:underline">
            {t('requestNewResetLink', lang)}
          </a>
        </div>
      ) : !ready ? (
        <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-6 py-5 text-center">
          <p className="text-white/50 text-sm">{t('verifyingResetLink', lang)}</p>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="text-white/70 text-sm block mb-1">{t('newPasswordLabel', lang)}</label>
            <AuthInput
              icon={LockIcon}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('min8CharsPlaceholder', lang)}
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('confirmPasswordLabel', lang)}</label>
            <AuthInput
              icon={LockIcon}
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('reenterPasswordPlaceholder', lang)}
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
            {loading ? t('updatingDots', lang) : t('updatePassword', lang)}
          </RippleButton>
        </form>
      )}
    </AuthLayout>
  )
}
