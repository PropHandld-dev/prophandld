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
import { AddressAutocomplete, type AutocompletePlace } from '@/components/AddressAutocomplete'
import { SITE_URL } from '@/lib/site'
import { setAppMetadataRole } from '@/lib/setAppMetadataRole'

const ROLE_CONTENT: Record<Role, { headline: string; subtext: string; checklist: string[] }> = {
  landlord: {
    headline: 'Run your rentals, not a spreadsheet.',
    subtext: "Takes about two minutes to get set up. Less time than deciding what to have for dinner.",
    checklist: ['Sealed bidding', 'No surprise costs', 'Photo-verified work'],
  },
  renter: {
    headline: 'Get things fixed, fast.',
    subtext: "Report an issue in seconds, no digging through old texts to find your landlord's number.",
    checklist: ['Report issues in one tap', 'See emergency contacts for your unit', 'Track your lease documents', 'Pay rent online, no checks or cash'],
  },
  contractor: {
    headline: 'Bid fair, get picked on merit.',
    subtext: 'See real jobs near you and submit a sealed bid, no guessing what everyone else quoted.',
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
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  // Set once signUp() comes back with no session — Supabase's signal that
  // this project requires clicking a confirmation link before the account
  // is real, rather than the account being usable the instant someone
  // types an email address (theirs or not) into the form.
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [otpCode, setOtpCode] = useState('')
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    preferred_language: 'en',
    property_count: '',
    first_property_address: '',
  })
  // Captured alongside the typed address, same as the real property form —
  // not inserted anywhere yet (nothing can be, before the account exists),
  // just carried in signup metadata so /landlord/properties/new can prefill
  // itself once the account is confirmed, instead of asking for the same
  // address twice.
  const [firstPropertyPlace, setFirstPropertyPlace] = useState<AutocompletePlace | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) return
    setLoading(true)
    setError(null)
    setAlreadyRegistered(false)

    const { data, error: signupError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          phone: form.phone,
          role,
          preferred_language: form.preferred_language,
          ...(role === 'landlord' && form.property_count ? { property_count: form.property_count } : {}),
          ...(role === 'landlord' && firstPropertyPlace ? {
            onboarding_address: firstPropertyPlace.address,
            onboarding_city: firstPropertyPlace.city,
            onboarding_state: firstPropertyPlace.state,
            onboarding_zip: firstPropertyPlace.zip,
            onboarding_lat: firstPropertyPlace.lat,
            onboarding_lng: firstPropertyPlace.lng,
          } : {}),
        },
        // Always the real domain, never window.location.origin — a
        // confirmation link built from a raw Vercel deployment URL lands
        // behind Vercel's own login wall instead of the app. See SITE_URL.
        emailRedirectTo: `${SITE_URL}/login`,
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

    // Supabase deliberately returns a fake success here rather than an
    // error, for an email that already belongs to a confirmed account —
    // so a stranger can't use signup to probe which emails are registered.
    // The one documented tell is an empty identities array. Without this
    // check, whoever hit it would land on "check your email" and just wait
    // forever, since nothing was actually sent — same dead end for a
    // landlord, renter, or contractor, so this check runs before the
    // role-specific branches below, not inside any of them.
    if (data.user.identities && data.user.identities.length === 0) {
      setAlreadyRegistered(true)
      setError('This email is already registered.')
      setLoading(false)
      return
    }

    // The public.users row (created by a DB trigger off auth.users, same
    // moment as the signUp() call above) only ever gets preferred_language
    // from a later /profile save — never from signup itself. Every
    // server-sent email reads it straight from public.users, so without
    // this, a Spanish-speaking sign-up would get English emails right up
    // until they happened to open Profile and hit Save once. Fire-and-log:
    // worst case on failure is that same pre-existing gap, not a blocked
    // signup.
    supabase
      .from('users')
      .update({ preferred_language: form.preferred_language })
      .eq('id', data.user.id)
      .then(({ error: langSyncError }) => {
        if (langSyncError) console.error('signup: could not sync preferred_language to public.users', langSyncError)
      })

    // role above only ever lands in user_metadata, which this same user
    // could rewrite themselves later (it's just a profile field as far as
    // Supabase is concerned) — that's the actual security boundary every
    // server-side role check needs, so it has to live somewhere only the
    // server can write. setAppMetadataRole() sets the real, tamper-proof
    // copy in app_metadata — but it needs an actual session, which this
    // project's required email confirmation means signUp() usually hasn't
    // produced yet (data.session is null until confirmed). Call it here
    // only for the rare case a session did come back immediately;
    // otherwise it's called once a session actually exists, at the end of
    // the confirmation-code flow below and in /login for the
    // confirmation-link flow.
    if (data.session) setAppMetadataRole(role)

    // No session back means this project requires confirming the email
    // address before the account is usable — the account row exists, but
    // nobody is signed in yet. Show that instead of walking straight into
    // onboarding, which is what let someone in on a typo'd or unowned
    // email today.
    if (!data.session) {
      setConfirmationEmail(form.email)
      setLoading(false)
      return
    }

    try {
      sessionStorage.setItem('ph_just_signed_in', '1')
    } catch {}

    if (role === 'landlord') {
      router.replace('/landlord/properties/new?onboarding=1')
    } else if (role === 'renter') {
      await linkPendingInvite()
      router.replace('/renter')
    } else if (role === 'contractor') {
      fetch('/api/contractor/accept-invite', { method: 'POST' }).catch(() => {})
      router.replace('/contractor')
    }

    setLoading(false)
  }

  const linkPendingInvite = async () => {
    // Must run server-side (service role) — the renter isn't the unit's
    // landlord, so the tenancies INSERT policy blocks this from the
    // renter's own client session. See /api/tenancy/link-invite.
    try {
      const res = await fetch('/api/tenancy/link-invite', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('Error auto-linking invited tenancy:', data.error)
      }
    } catch (err) {
      console.error('Error checking pending invite:', err)
    }
  }

  const handleResend = async () => {
    if (!confirmationEmail || resendState === 'sending') return
    setResendState('sending')
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: confirmationEmail,
      options: { emailRedirectTo: `${SITE_URL}/login` },
    })
    if (resendError) {
      setError('Could not resend: ' + resendError.message)
      setResendState('idle')
      return
    }
    setResendState('sent')
  }

  // Supabase's confirmation email carries both a click-through link and a
  // numeric code (the same underlying token, two ways to use it) — this is
  // the code path, for anyone checking email on a different device than
  // they're signing up on, where a link is more friction than typing the
  // code. Deliberately not assuming a specific digit count anywhere here —
  // Supabase's own default (whatever this project is actually configured
  // for) decides that, the input just accepts digits up to a generous
  // upper bound. On success this hands off to /login exactly the way clicking
  // the link already does (same SIGNED_IN event, same consumeFreshSignIn()
  // pickup there) rather than duplicating the welcome-email/invite-linking/
  // role-redirect logic a third time in this file.
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmationEmail || otpCode.trim().length === 0) return
    setVerifyingCode(true)
    setOtpError(null)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: confirmationEmail,
      token: otpCode.trim(),
      type: 'signup',
    })

    if (verifyError) {
      // A network failure reaching Supabase (name === 'AuthRetryableFetchError',
      // set by the SDK for exactly this case) has nothing to do with what was
      // typed — telling someone "that code didn't work" when the real problem
      // is their connection sends them second-guessing a code they got right,
      // which is exactly what happened here: this got reported as a wrong-code
      // bug when the actual failure was the browser never reaching Supabase at
      // all (the resend button right below surfaced the real error honestly;
      // this one was silently flattened into the generic message instead).
      setOtpError(
        verifyError.name === 'AuthRetryableFetchError'
          ? "Couldn't reach the server. Check your connection and try again."
          : 'That code didn\'t work. Double-check it, or use the link in the email instead.'
      )
      setVerifyingCode(false)
      return
    }

    // Belt-and-suspenders alongside consumeFreshSignIn(): verifyOtp() just
    // fired a SIGNED_IN event, but Supabase dispatches that notification to
    // subscribers asynchronously, not necessarily before this tick ends —
    // and router.replace() below is a same-tab SPA transition, so /login's
    // mount effect can genuinely run and check consumeFreshSignIn() before
    // that event has actually landed. Losing that race used to be silently
    // masked by a since-fixed bug (any already-signed-in /login visit fired
    // the welcome email); now that it's fixed, losing it means a real first
    // activation gets treated as an ordinary already-signed-in visit and
    // never gets welcomed at all. This flag is a synchronous, same-tick
    // fact instead of a race — set here, read and cleared once on arrival.
    try {
      sessionStorage.setItem('ph_just_activated', '1')
    } catch {}

    router.replace('/login')
  }

  if (confirmationEmail) {
    return (
      <AuthLayout headline="Almost there." subtext="One more step and your account is ready.">
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mx-auto mb-5">
            <MailIcon className="w-6 h-6 text-[#12A5A9]" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Check your email</h2>
          <p className="text-white/60 text-sm mb-1">
            We sent a code to
          </p>
          <p className="text-white font-semibold mb-5">{confirmationEmail}</p>

          <form onSubmit={handleVerifyCode} className="text-left mb-6">
            <label className="text-white/70 text-sm block mb-1.5 text-center">Enter the code from that email</label>
            <AuthInput
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="Code"
              className="text-center text-lg tracking-[0.3em] font-semibold"
            />
            {otpError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
                {otpError}
              </div>
            )}
            <RippleButton
              type="submit"
              disabled={verifyingCode || otpCode.length === 0}
              className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50 mt-3"
            >
              {verifyingCode ? 'Verifying...' : 'Verify'}
            </RippleButton>
          </form>

          <p className="text-white/50 text-sm mb-4">
            Or click the link in that same email instead. If this wasn&apos;t your email, no account was created for you, so there&apos;s nothing to do.
          </p>
          <RippleButton
            type="button"
            onClick={handleResend}
            disabled={resendState === 'sending'}
            className="text-[#12A5A9] text-sm font-semibold hover:underline disabled:opacity-50"
          >
            {resendState === 'sent' ? '✓ Sent again' : resendState === 'sending' ? 'Sending...' : "Didn't get either? Resend"}
          </RippleButton>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-4">
              {error}
            </div>
          )}
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setConfirmationEmail(null)}
              className="text-white/50 text-xs hover:text-white transition"
            >
              Wrong email? Go back
            </button>
          </div>
        </div>
      </AuthLayout>
    )
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

        <p className="text-center text-white/60 text-sm mt-6">
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
            className="text-white/60 text-xs hover:text-white transition"
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

        {role === 'landlord' && (
          <div>
            <label className="text-white/70 text-sm block mb-1">How many rental properties do you have?</label>
            <select
              name="property_count"
              value={form.property_count}
              onChange={handleChange}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] focus:ring-2 focus:ring-[#12A5A9]/15 transition"
            >
              <option value="" className="bg-[#0C1A2E]">Prefer not to say</option>
              <option value="1" className="bg-[#0C1A2E]">Just 1</option>
              <option value="2-5" className="bg-[#0C1A2E]">2–5</option>
              <option value="6-10" className="bg-[#0C1A2E]">6–10</option>
              <option value="11-25" className="bg-[#0C1A2E]">11–25</option>
              <option value="26+" className="bg-[#0C1A2E]">26 or more</option>
            </select>
            <p className="text-white/40 text-xs mt-1">Helps us set you up right, never shown to anyone else.</p>
          </div>
        )}

        {role === 'landlord' && (
          <div>
            <label className="text-white/70 text-sm block mb-1">Address of your first property (optional)</label>
            <AddressAutocomplete
              value={form.first_property_address}
              onChange={(value) => {
                setForm({ ...form, first_property_address: value })
                setFirstPropertyPlace(null)
              }}
              onPlaceSelected={(place) => {
                setForm({ ...form, first_property_address: place.address })
                setFirstPropertyPlace(place)
              }}
              placeholder="Start typing an address..."
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-[#12A5A9] focus:ring-2 focus:ring-[#12A5A9]/15 transition"
            />
            <p className="text-white/40 text-xs mt-1">Skip this if you'd rather add it after confirming your email. Either way works.</p>
          </div>
        )}

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
            {alreadyRegistered && (
              <>
                {' '}
                <Link href={`/login${role ? `?role=${role}` : ''}`} className="underline font-medium hover:text-red-300">
                  Log in instead →
                </Link>
              </>
            )}
          </div>
        )}

        <RippleButton
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50 mt-2"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </RippleButton>

        <p className="text-center text-white/50 text-xs">
          By continuing, you agree to Prophandld's{' '}
          <Link href="/terms" className="text-[#12A5A9]/80 hover:underline">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-[#12A5A9]/80 hover:underline">Privacy Policy</Link>.
        </p>

        <p className="text-center text-white/60 text-sm">
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
