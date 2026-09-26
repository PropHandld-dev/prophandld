'use client'

import { useState, useEffect, Suspense } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { AuthLayout } from '@/components/AuthLayout'
import { Logo } from '@/components/Logo'
import { AuthInput } from '@/components/AuthInput'
import { MailIcon, LockIcon, CheckCircleIcon } from '@/components/icons'
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
  // True until the initial "is there already a session?" check finishes —
  // covers a tenant/contractor who clicked an email-confirmation link
  // rather than typing their password in on this page. Starts true so the
  // role picker never flashes for someone about to be redirected straight
  // through.
  const [checkingSession, setCheckingSession] = useState(true)
  // Set only when the session on this page load came from actually
  // clicking an email-confirmation link (see the hash check below) — not
  // for an ordinary already-signed-in visit to /login, which should still
  // redirect straight through with no interruption.
  const [justVerifiedUser, setJustVerifiedUser] = useState<User | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  // Everything that needs to happen once we know who's signed in, whether
  // they got here by typing a password or by Supabase silently starting a
  // session from an email-confirmation link's URL. Shared so both paths
  // behave identically. `isFirstActivation` is only ever true from the
  // auto-detected-session path below — that's the one moment that reliably
  // means "this account just went from confirmed to actually signed in,"
  // as opposed to any other ordinary login, so it's the only place the
  // welcome email fires from.
  const completeSignIn = async (user: User, isFirstActivation = false) => {
    try {
      sessionStorage.setItem('ph_just_signed_in', '1')
    } catch {}
    const accountRole = user.user_metadata?.role
    if (isFirstActivation && (accountRole === 'landlord' || accountRole === 'renter' || accountRole === 'contractor')) {
      fetch('/api/auth/welcome', { method: 'POST' }).catch((err) =>
        console.error('Error sending welcome email:', err)
      )
    }
    if (accountRole === 'renter') {
      // A renter's real first entry into the app now happens here, not on
      // the signup page — since email confirmation was turned on, signup
      // diverts to "check your email" and this sign-in, after clicking
      // that link, is the first time they're actually authenticated. A
      // pending tenancy invite used to only ever get linked right after
      // signup, so it was silently stuck for anyone who had to confirm
      // first. Safe to call every login: a no-op once already linked.
      try {
        const res = await fetch('/api/tenancy/link-invite', { method: 'POST' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          console.error('Error auto-linking invited tenancy on login:', body.error)
        }
      } catch (err) {
        console.error('Error checking pending invite on login:', err)
      }
    }
    if (accountRole === 'contractor') {
      // Same bug, same fix, for a contractor a landlord invited: closing
      // out the invite used to only happen right after signup too.
      fetch('/api/contractor/accept-invite', { method: 'POST' }).catch((err) =>
        console.error('Error closing out contractor invite on login:', err)
      )
    }
    if (accountRole === 'landlord') {
      // A brand-new landlord used to land straight on "add your first
      // property" right after signup. Email confirmation now means that
      // redirect (in signup/page.tsx) never actually fires — Supabase
      // never hands back a session synchronously anymore, so signup always
      // diverts to "check your email" first, and this login flow is the
      // real first entry. Without this check they'd land on an empty
      // dashboard with nothing on it and no obvious next step. Checking
      // property count instead of a one-time flag also self-heals a
      // landlord who backs out of onboarding without adding one — they get
      // sent right back to it next time, instead of staying stuck on an
      // empty dashboard.
      const { count } = await supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user.id)
      if (!count) router.replace('/landlord/properties/new?onboarding=1')
      else router.replace('/landlord')
    }
    else if (accountRole === 'renter') router.replace('/renter')
    else if (accountRole === 'contractor') router.replace('/contractor')
    else router.replace('/')
  }

  // The confirmation link a tenant/contractor clicks in their email lands
  // them right back on this page — and Supabase's client silently starts a
  // real session from the link's own URL the moment it loads, with no code
  // of ours involved. The "check your email" screen never tells anyone to
  // come back and log in afterward, so most people just close the tab at
  // that point, believing "click the link" was the whole job. Without this
  // check they'd sit here already signed in, invite still stuck on
  // "pending," having done nothing wrong. Catch that on mount and finish
  // the job automatically, the same way a manual sign-in would.
  useEffect(() => {
    let cancelled = false
    // Read this synchronously, before anything else runs — Supabase's
    // client strips its auth tokens out of the URL hash right after
    // parsing it, so this is the one chance to see whether "type=signup"
    // was in there (present only when this page load came from an actual
    // confirmation-link click, not any other reason a session might
    // already exist here).
    const justVerified = typeof window !== 'undefined' && window.location.hash.includes('type=signup')
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session?.user && justVerified) {
        setJustVerifiedUser(session.user)
        setCheckingSession(false)
      } else if (session?.user) {
        completeSignIn(session.user, true)
      } else {
        setCheckingSession(false)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      await completeSignIn(data.user)
    }

    setLoading(false)
  }

  const handleContinue = async () => {
    if (!justVerifiedUser || continuing) return
    setContinuing(true)
    await completeSignIn(justVerifiedUser, true)
  }

  if (checkingSession) {
    // The literal first thing a real person sees right after clicking a
    // confirmation link — worth it being a branded moment, not a bare
    // "Loading...". Usually invisible in practice (this resolves fast),
    // but on a slow connection it's the difference between "this is
    // working" and "did that link just not work."
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex flex-col items-center justify-center gap-4">
        <Logo className="w-10 h-10 motion-safe:animate-pulse" />
        <div className="text-white/50 text-sm">Confirming your account...</div>
      </div>
    )
  }

  if (justVerifiedUser) {
    // The actual "you're in" moment — deliberately its own click rather
    // than an instant auto-redirect, so clicking the email link visibly
    // *does something* instead of quietly dropping someone on a dashboard
    // with no acknowledgment anything just happened. Same screen for
    // every role — nothing here depends on which one signed up.
    return (
      <AuthLayout headline="You're verified." subtext="One click and you're in.">
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mx-auto mb-5 motion-safe:animate-[popIn_0.5s_ease-out]">
            <CheckCircleIcon className="w-8 h-8 text-[#12A5A9]" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Email verified!</h2>
          <p className="text-white/50 text-sm mb-8">Your Prophandld account is ready to go.</p>
          <RippleButton
            type="button"
            onClick={handleContinue}
            disabled={continuing}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {continuing ? 'Taking you in...' : 'Continue to your dashboard →'}
          </RippleButton>
        </div>
      </AuthLayout>
    )
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
