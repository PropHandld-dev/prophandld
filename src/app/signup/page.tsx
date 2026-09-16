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

const ROLE_CONTENT: Record<Role, { headline: string; subtext: string; checklist: string[] }> = {
  landlord: {
    headline: 'Run your rentals, not a spreadsheet.',
    subtext: "Takes about two minutes to get set up. Less time than deciding what to have for dinner.",
    checklist: ['Sealed bidding', 'No surprise costs', 'Photo-verified work'],
  },
  renter: {
    headline: 'Get things fixed, fast.',
    subtext: "Report an issue in seconds — no digging through old texts to find your landlord's number.",
    checklist: ['Report issues in one tap', 'See emergency contacts for your unit', 'Track your lease documents', 'Online rent payments — coming soon'],
  },
  contractor: {
    headline: 'Bid fair, get picked on merit.',
    subtext: 'See real jobs near you and submit a sealed bid — no guessing what everyone else quoted.',
    checklist: ['Sealed, fair bidding', 'Get verified, get trusted', 'Build your rating over time'],
  },
}

const VALID_ROLES: Role[] = ['landlord', 'renter', 'contractor']

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialRole = searchParams.get('role') as Role | null
  const [role, setRole] = useState<Role | null>(
    initialRole && VALID_ROLES.includes(initialRole) ? initialRole : null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    preferred_language: 'en',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) return
    setLoading(true)
    setError(null)

    const { data, error: signupError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          phone: form.phone,
          role,
          preferred_language: form.preferred_language,
        },
      },
    })

    if (signupError) {
      setError('Auth error: ' + signupError.message)
      setLoading(false)
      return
    }

    if (!data.user) {
      setError('No user returned from signup')
      setLoading(false)
      return
    }

    if (role === 'landlord') {
      router.replace('/landlord/properties/new?onboarding=1')
    } else if (role === 'renter') {
      await linkPendingInvite(data.user.id, form.email)
      router.replace('/renter')
    } else if (role === 'contractor') {
      router.replace('/contractor')
    }

    setLoading(false)
  }

  const linkPendingInvite = async (userId: string, email: string) => {
    try {
      const { data: invite } = await supabase
        .from('tenancy_invites')
        .select('*')
        .eq('renter_email', email)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!invite) return

      const { error: tenancyError } = await supabase
        .from('tenancies')
        .insert({
          unit_id: invite.unit_id,
          renter_user_id: userId,
          rent_amount: invite.rent_amount,
          lease_start: invite.lease_start,
          lease_end: invite.lease_end,
          security_deposit: invite.security_deposit,
          escalation_percent: invite.escalation_percent,
          escalation_frequency_months: invite.escalation_frequency_months,
          occupants: invite.occupants,
          pets: invite.pets,
          lease_notes: invite.lease_notes,
        })

      if (tenancyError) {
        console.error('Error auto-linking invited tenancy:', tenancyError)
        return
      }

      await supabase
        .from('tenancy_invites')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invite.id)
    } catch (err) {
      console.error('Error checking pending invite:', err)
    }
  }

  if (!role) {
    return (
      <AuthLayout
        headline="First, who are you?"
        subtext="We'll set things up just right, depending on your answer."
      >
        <div className="text-center mb-8 lg:text-left">
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-white/50 text-sm mt-1">Your property, handled.</p>
        </div>

        <RolePicker onSelect={setRole} />

        <p className="text-center text-white/40 text-sm mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-[#12A5A9] hover:underline">
            Sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  const { headline, subtext, checklist } = ROLE_CONTENT[role]

  return (
    <AuthLayout headline={headline} subtext={subtext} checklist={checklist} showChecklist>
      <div className="text-center mb-6 lg:text-left">
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <div className="flex items-center justify-center lg:justify-start gap-2 mt-2">
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2.5 py-1 font-semibold capitalize">
            {role}
          </span>
          <button
            type="button"
            onClick={() => setRole(null)}
            className="text-white/40 text-xs hover:text-white transition"
          >
            Not right? Change
          </button>
        </div>
      </div>

      {/* Mobile-only checklist, since the brand panel checklist is desktop-only */}
      <ul className="lg:hidden flex flex-wrap justify-center gap-2 mb-6">
        {checklist.map((item) => (
          <li key={item} className="text-xs bg-white/5 border border-white/10 rounded-full px-3 py-1 text-white/50">
            {item}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSignup} className="space-y-4">

        <div>
          <label className="text-white/70 text-sm block mb-1">Full name</label>
          <AuthInput
            type="text"
            name="full_name"
            required
            value={form.full_name}
            onChange={handleChange}
            placeholder="Jane Doe"
          />
        </div>

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
          <label className="text-white/70 text-sm block mb-1">Phone</label>
          <AuthInput
            type="tel"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="+1 (555) 000-0000"
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
            placeholder="Min. 8 characters"
          />
        </div>

        <div>
          <label className="text-white/70 text-sm block mb-1">Preferred language</label>
          <select
            name="preferred_language"
            value={form.preferred_language}
            onChange={handleChange}
            className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] focus:ring-2 focus:ring-[#12A5A9]/15 transition"
          >
            <option value="en" className="bg-[#0C1A2E]">English</option>
            <option value="es" className="bg-[#0C1A2E]">Spanish</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <RippleButton
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50 mt-2"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </RippleButton>

        <p className="text-center text-white/30 text-xs">
          By continuing, you agree to Prophandld's{' '}
          <Link href="/terms" className="text-[#12A5A9]/80 hover:underline">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-[#12A5A9]/80 hover:underline">Privacy Policy</Link>.
        </p>

        <p className="text-center text-white/40 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-[#12A5A9] hover:underline">
            Sign in
          </Link>
        </p>

      </form>
    </AuthLayout>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  )
}
