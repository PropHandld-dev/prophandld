'use client'

import { useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { AuthLayout } from '@/components/AuthLayout'
import { AuthInput } from '@/components/AuthInput'
import { MailIcon, LockIcon } from '@/components/icons'
import { RolePicker, type Role } from '@/components/RolePicker'

// Purely cosmetic — sets which flavor of copy shows on the brand panel.
// The actual post-login redirect always uses the account's real stored role.
const ROLE_CONTENT: Record<Role, { headline: string; subtext: string; checklist: string[] }> = {
  landlord: {
    headline: 'Welcome back.',
    subtext: "Your properties didn't manage themselves while you were gone. Let's see what's going on.",
    checklist: ['Sealed bidding', 'No surprise costs', 'Photo-verified work'],
  },
  renter: {
    headline: 'Welcome back.',
    subtext: 'Got something to report, or just checking on a fix in progress?',
    checklist: ['Report issues in one tap', 'See emergency contacts for your unit', 'Track your lease documents', 'Pay rent online, no checks or cash'],
  },
  contractor: {
    headline: 'Welcome back.',
    subtext: 'New jobs might be waiting on you. Let\'s take a look.',
    checklist: ['Sealed, fair bidding', 'Get verified, get trusted', 'Build your rating over time'],
  },
}

const VALID_ROLES: Role[] = ['landlord', 'renter', 'contractor']

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialRole = searchParams.get('role') as Role | null
  const [role, setRole] = useState<Role | null>(
    initialRole && VALID_ROLES.includes(initialRole) ? initialRole : null
  )
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
      try {
        sessionStorage.setItem('ph_just_signed_in', '1')
      } catch {}
      const accountRole = data.user.user_metadata?.role
      if (accountRole === 'landlord') router.replace('/landlord')
      else if (accountRole === 'renter') router.replace('/renter')
      else if (accountRole === 'contractor') router.replace('/contractor')
      else router.replace('/')
    }

    setLoading(false)
  }

  if (!role) {
    return (
      <AuthLayout
        headline="Welcome back."
        subtext="Who's signing in today?"
      >
        <div className="text-center mb-8 lg:text-left">
          <h1 className="text-2xl font-bold text-white">Sign in</h1>
          <p className="text-white/50 text-sm mt-1">Good to see you again.</p>
        </div>

        <RolePicker onSelect={setRole} />

        <p className="text-center text-white/60 text-sm mt-6">
          Don't have an account?{' '}
          <Link href="/signup" className="text-[#12A5A9] hover:underline">
            Create one
          </Link>
        </p>
      </AuthLayout>
    )
  }

  const { headline, subtext, checklist } = ROLE_CONTENT[role]

  return (
    <AuthLayout headline={headline} subtext={subtext} checklist={checklist} showChecklist>
      <div className="text-center mb-8 lg:text-left">
        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <div className="flex items-center justify-center lg:justify-start gap-2 mt-2">
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2.5 py-1 font-semibold capitalize">
            {role}
          </span>
          <button
            type="button"
            onClick={() => setRole(null)}
            className="text-white/60 text-xs hover:text-white transition"
          >
            Not you? Change
          </button>
        </div>
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

        <p className="text-center text-white/60 text-sm">
          Don't have an account?{' '}
          <Link href="/signup" className="text-[#12A5A9] hover:underline">
            Create one
          </Link>
        </p>

      </form>
    </AuthLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
