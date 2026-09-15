'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { AuthLayout } from '@/components/AuthLayout'
import { AuthInput } from '@/components/AuthInput'
import { MailIcon, LockIcon } from '@/components/icons'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (loginError) {
      setError(loginError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const role = data.user.user_metadata?.role
      if (role === 'landlord') router.push('/landlord')
      else if (role === 'renter') router.push('/renter')
      else if (role === 'contractor') router.push('/contractor')
      else router.push('/')
    }

    setLoading(false)
  }

  return (
    <AuthLayout
      headline="Welcome back."
      subtext="Your properties didn't manage themselves while you were gone. Let's see what's going on."
      showChecklist
    >
      <div className="text-center mb-8 lg:text-left">
        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <p className="text-white/50 text-sm mt-1">Good to see you again.</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">

        <div>
          <label className="text-white/70 text-sm block mb-1">Email</label>
          <AuthInput
            icon={MailIcon}
            type="email"
            name="email"
            required
            value={form.email}
            onChange={handleChange}
            placeholder="you@email.com"
          />
        </div>

        <div>
          <label className="text-white/70 text-sm block mb-1">Password</label>
          <AuthInput
            icon={LockIcon}
            type="password"
            name="password"
            required
            value={form.password}
            onChange={handleChange}
            placeholder="Your password"
          />
        </div>

        <div className="text-right">
          <Link href="/forgot-password" className="text-[#12A5A9] text-sm hover:underline">
            Forgot password?
          </Link>
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
          {loading ? 'Signing in...' : 'Sign in'}
        </RippleButton>

        <p className="text-center text-white/40 text-sm">
          Don't have an account?{' '}
          <Link href="/signup" className="text-[#12A5A9] hover:underline">
            Create one
          </Link>
        </p>

      </form>
    </AuthLayout>
  )
}
