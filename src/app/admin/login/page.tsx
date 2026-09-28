'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { AuthInput } from '@/components/AuthInput'
import { RippleButton } from '@/components/RippleButton'
import { MailIcon, LockIcon } from '@/components/icons'

// Deliberately its own page, not a variant of the consumer /login — same
// underlying Supabase Auth (no separate credential store to manage), but a
// distinct front door: no role picker, no marketing panel, nothing that
// reads as "sign up for Prophandld". Whether someone who signs in here is
// actually authorized is decided separately, by admin_users via
// /api/admin/check-access — this page only gets them signed in and then
// asks that question, it isn't itself the security boundary.
export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
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

    router.replace('/admin')
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

        <form onSubmit={handleSubmit} className="space-y-3">
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
