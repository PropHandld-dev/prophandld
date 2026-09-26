'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { AuthLayout } from '@/components/AuthLayout'
import { AuthInput } from '@/components/AuthInput'
import { MailIcon, CheckCircleIcon } from '@/components/icons'
import { SITE_URL } from '@/lib/site'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Always the real domain, never window.location.origin — see SITE_URL.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE_URL}/reset-password`,
    })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <AuthLayout
      headline="Happens to the best of us."
      subtext="Enter your email and we'll send you a link to get back in."
    >
      <div className="text-center mb-8 lg:text-left">
        <h1 className="text-2xl font-bold text-white">Reset your password</h1>
        <p className="text-white/50 text-sm mt-1">We'll email you a reset link.</p>
      </div>

      {sent ? (
        <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-6 py-5 text-center">
          <CheckCircleIcon className="w-6 h-6 text-[#12A5A9] mx-auto mb-2" />
          <p className="text-[#12A5A9] font-medium">Check your email</p>
          <p className="text-white/50 text-sm mt-1">
            We sent a password reset link to {email}. Click it to set a new password.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-white/70 text-sm block mb-1">Email</label>
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
            {loading ? 'Sending...' : 'Send reset link'}
          </RippleButton>

          <Link href="/login" className="block text-center text-white/60 hover:text-white text-sm transition">
            Back to login
          </Link>
        </form>
      )}
    </AuthLayout>
  )
}
