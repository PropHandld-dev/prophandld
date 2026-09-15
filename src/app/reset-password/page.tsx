'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { RippleButton } from '@/components/RippleButton'
import { AuthLayout } from '@/components/AuthLayout'
import { AuthInput } from '@/components/AuthInput'
import { LockIcon, CheckCircleIcon } from '@/components/icons'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
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
        setError('This reset link is invalid or has expired. Please request a new one.')
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
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
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
    setTimeout(() => router.push('/login'), 2000)
    setLoading(false)
  }

  return (
    <AuthLayout
      headline="Almost there."
      subtext="Pick a new password and you're back in business."
    >
      <div className="text-center mb-8 lg:text-left">
        <h1 className="text-2xl font-bold text-white">Set new password</h1>
        <p className="text-white/50 text-sm mt-1">Choose a strong password.</p>
      </div>

      {done ? (
        <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-6 py-5 text-center">
          <CheckCircleIcon className="w-6 h-6 text-[#12A5A9] mx-auto mb-2" />
          <p className="text-[#12A5A9] font-medium">Password updated!</p>
          <p className="text-white/50 text-sm mt-1">Redirecting to login...</p>
        </div>
      ) : error && !ready ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
          {error}
          <a href="/forgot-password" className="block mt-3 text-[#12A5A9] hover:underline">
            Request a new reset link
          </a>
        </div>
      ) : !ready ? (
        <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-6 py-5 text-center">
          <p className="text-white/50 text-sm">Verifying reset link...</p>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="text-white/70 text-sm block mb-1">New password</label>
            <AuthInput
              icon={LockIcon}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Confirm password</label>
            <AuthInput
              icon={LockIcon}
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
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
            {loading ? 'Updating...' : 'Update password'}
          </RippleButton>
        </form>
      )}
    </AuthLayout>
  )
}
