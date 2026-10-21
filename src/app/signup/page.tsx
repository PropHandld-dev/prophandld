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
import { SITE_URL } from '@/lib/site'
import { setAppMetadataRole } from '@/lib/setAppMetadataRole'
import { t, roleLabel, type Lang } from '@/lib/i18n'

const ROLE_LABEL_KEY = { landlord: 'landlordLabel', renter: 'renterLabel', contractor: 'contractorLabel' } as const

// Mirrors each role terms page's own `lastUpdated` string (src/app/terms/{role}/page.tsx)
// — bump the matching entry here whenever that page's content changes, so
// terms_version on signup always records which version was actually agreed to.
const TERMS_VERSION: Record<Role, string> = {
  landlord: '2026-10-20',
  renter: '2026-10-20',
  contractor: '2026-10-19',
}

// No signed-in session exists yet on this page, so there's no
// useLanguage()-style saved preference to read — `lang` is computed from
// the in-progress form's own "Preferred language" select instead (see
// SignupForm below), same as the handful of spots that already did this
// before the rest of the page's i18n audit gap was found and fixed.
function getRoleContent(role: Role, lang: Lang): { headline: string; subtext: string; checklist: string[] } {
  if (role === 'landlord') {
    return {
      headline: t('signupHeadlineLandlord', lang),
      subtext: t('signupSubtextLandlord', lang),
      checklist: [t('loginChecklistLandlord1', lang), t('loginChecklistLandlord2', lang), t('loginChecklistLandlord3', lang)],
    }
  }
  if (role === 'renter') {
    return {
      headline: t('signupHeadlineRenter', lang),
      subtext: t('signupSubtextRenter', lang),
      checklist: [t('loginChecklistRenter1', lang), t('loginChecklistRenter2', lang), t('loginChecklistRenter3', lang), t('loginChecklistRenter4', lang)],
    }
  }
  return {
    headline: t('signupHeadlineContractor', lang),
    subtext: t('signupSubtextContractor', lang),
    checklist: [t('loginChecklistContractor1', lang), t('loginChecklistContractor2', lang), t('loginChecklistContractor3', lang)],
  }
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
  // Set when the email they just tried belongs to an existing account of a
  // DIFFERENT role — offers linking a new profile to it instead of the
  // plain "already registered" dead end. Same-role duplicates (the much
  // more common case — someone just forgot they already signed up) still
  // get the plain error with "log in instead", not this.
  const [linkOffer, setLinkOffer] = useState<{ existingRole: Role } | null>(null)
  const [linkPassword, setLinkPassword] = useState('')
  const [linkSubmitting, setLinkSubmitting] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  // Set once signUp() comes back with no session — Supabase's signal that
  // this project requires clicking a confirmation link before the account
  // is real, rather than the account being usable the instant someone
  // types an email address (theirs or not) into the form.
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [otpCode, setOtpCode] = useState('')
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    preferred_language: 'en',
  })
  // No signed-in session exists yet to read a saved preference from (see
  // getRoleContent's own comment) — the in-progress form's own language
  // select is the only signal available until the account actually exists.
  const lang = (form.preferred_language === 'es' ? 'es' : 'en') as Lang

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) return
    if (!agreedToTerms) {
      setError(t('pleaseAgreeToTerms', lang))
      return
    }
    setLoading(true)
    setError(null)
    setAlreadyRegistered(false)

    // Pre-flight, before an account can exist at all — closes the
    // free-tier loophole where someone signs up as a landlord repeatedly
    // with different emails to keep every property on a separate free
    // account instead of one real paid one. See
    // /api/signup/check-landlord-phone for the matching/role-scoping
    // logic; the Stripe Connect bank-fingerprint check is the other half.
    if (role === 'landlord' && form.phone.trim()) {
      const dupeCheck = await fetch('/api/signup/check-landlord-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone }),
      }).then((r) => r.json()).catch(() => ({ duplicate: false }))
      if (dupeCheck.duplicate) {
        setError(t('phoneAlreadyOnLandlordAccount', lang))
        setLoading(false)
        return
      }
    }

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
        // Always the real domain, never window.location.origin — a
        // confirmation link built from a raw Vercel deployment URL lands
        // behind Vercel's own login wall instead of the app. See SITE_URL.
        emailRedirectTo: `${SITE_URL}/login`,
      },
    })

    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    if (!data.user) {
      setError(t('noUserReturnedFromSignup', lang))
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
      const checkRes = await fetch('/api/profiles/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      }).catch(() => null)
      const checkData = await checkRes?.json().catch(() => null)

      if (checkData?.exists && checkData.role && checkData.role !== role) {
        setLinkOffer({ existingRole: checkData.role as Role })
        setLoading(false)
        return
      }

      setAlreadyRegistered(true)
      setError(t('emailAlreadyRegistered', lang))
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

    // The required-checkbox above only ever blocked the client-side form
    // submit — nothing durable recorded THAT this specific user agreed, OR
    // to which version of the role-specific terms, which is a real gap if
    // acceptance is ever contested. TERMS_VERSION below should track each
    // role terms page's own `lastUpdated` string whenever those pages change.
    // Goes through record_terms_acceptance() (a security-definer RPC, see
    // the security-hardening SQL script) rather than a plain client
    // `.update()` — that function stamps the DATABASE's own clock and is
    // write-once, so the record can't be backdated or later altered from
    // the client, which a plain update to this user's own row otherwise
    // would have allowed.
    supabase
      .rpc('record_terms_acceptance', { version: TERMS_VERSION[role] })
      .then(({ error: termsSyncError }) => {
        if (termsSyncError) console.error('signup: could not record terms acceptance', termsSyncError)
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
    // Awaited: the landlord branch below calls linkPendingCoOwnerInvite()
    // next, which (via co-owner/link-invite) gates on this having already
    // landed — losing that race used to send a co-owner-invited landlord
    // to "add your first property" instead of their co-owned portfolio.
    if (data.session) await setAppMetadataRole(role)

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
      sessionStorage.setItem('ph_just_signed_up', '1')
    } catch {}

    if (role === 'landlord') {
      // A landlord who signed up from a co-owner invite link is about to
      // co-manage someone else's existing portfolio, not start their own
      // — sending them to "add your first property" would be wrong (and
      // would attribute that new property to them, not the primary,
      // before they've even accepted the invite). Their dashboard shows
      // the pending-invite banner instead.
      const linkedCoOwnership = await linkPendingCoOwnerInvite()
      router.replace(linkedCoOwnership ? '/landlord' : '/landlord/properties/new?onboarding=1')
    } else if (role === 'renter') {
      await linkPendingInvite()
      router.replace('/renter')
    } else if (role === 'contractor') {
      fetch('/api/contractor/accept-invite', { method: 'POST', keepalive: true }).catch(() => {})
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

  // Returns whether a pending co-owner invite actually linked — the
  // caller uses this to decide whether to skip "add your first property"
  // onboarding. See /api/co-owner/link-invite.
  const linkPendingCoOwnerInvite = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/co-owner/link-invite', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Error auto-linking invited co-ownership:', data.error)
        return false
      }
      return !!data.linked
    } catch (err) {
      console.error('Error checking pending co-owner invite:', err)
      return false
    }
  }

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkOffer || !role) return
    setLinkSubmitting(true)
    setLinkError(null)
    try {
      const res = await fetch('/api/profiles/add-with-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: linkPassword, newRole: role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLinkError(data.error === 'Incorrect password for that email.' ? t('incorrectPasswordTryAgain', lang) : data.error || t('couldNotCreateProfile', lang))
        setLinkSubmitting(false)
        return
      }
      if (data.tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'email' })
        if (verifyError) {
          setLinkError(t('couldNotSwitchProfile', lang))
          setLinkSubmitting(false)
          return
        }
      }
      window.location.href = role === 'landlord' ? '/landlord' : role === 'renter' ? '/renter' : '/contractor'
    } catch {
      setLinkError(t('couldNotCreateProfile', lang))
      setLinkSubmitting(false)
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
      console.error('signup: resend failed', resendError)
      setError(t('couldNotResendCode', lang))
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
          ? t('couldNotReachServer', lang)
          : t('codeDidNotWork', lang)
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
      sessionStorage.setItem('ph_just_signed_up', '1')
    } catch {}

    router.replace('/login')
  }

  if (confirmationEmail) {
    return (
      <AuthLayout headline={t('almostThereHeadline', lang)} subtext={t('almostThereOneMoreStep', lang)}>
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mx-auto mb-5">
            <MailIcon className="w-6 h-6 text-[#12A5A9]" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">{t('checkYourEmailHeading', lang)}</h2>
          <p className="text-white/60 text-sm mb-1">
            {t('weSentACodeTo', lang)}
          </p>
          <p className="text-white font-semibold mb-5">{confirmationEmail}</p>

          <form onSubmit={handleVerifyCode} className="text-left mb-6">
            <label className="text-white/70 text-sm block mb-1.5 text-center">{t('enterCodeFromEmailLabel', lang)}</label>
            <AuthInput
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder={t('codePlaceholder', lang)}
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
              {verifyingCode ? t('verifyingDots', lang) : t('verifyBtn', lang)}
            </RippleButton>
          </form>

          <p className="text-white/50 text-sm mb-4">
            {t('orClickLinkInEmail', lang)}
          </p>
          <RippleButton
            type="button"
            onClick={handleResend}
            disabled={resendState === 'sending'}
            className="text-[#12A5A9] text-sm font-semibold hover:underline disabled:opacity-50"
          >
            {resendState === 'sent' ? t('sentAgainCheck', lang) : resendState === 'sending' ? t('sendingDotsPlain', lang) : t('didntGetEitherResend', lang)}
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
              {t('wrongEmailGoBack', lang)}
            </button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  if (!role) {
    return (
      <AuthLayout
        headline={t('firstWhoAreYouHeadline', lang)}
        subtext={t('weWillSetThingsUpSubtext', lang)}
      >
        <div className="text-center mb-8 lg:text-left">
          <h1 className="text-2xl font-bold text-white">{t('createYourAccountHeading', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">{t('yourPropertyHandledTagline', lang)}</p>
        </div>

        <RolePicker onSelect={setRole} />

        <p className="text-center text-white/60 text-sm mt-6">
          {t('alreadyHaveAccountQ', lang)}{' '}
          <Link href="/login" className="text-[#12A5A9] hover:underline">
            {t('signIn', lang)}
          </Link>
        </p>
      </AuthLayout>
    )
  }

  const { headline, subtext, checklist } = getRoleContent(role, lang)

  return (
    <AuthLayout headline={headline} subtext={subtext} checklist={checklist} showChecklist>
      <div className="text-center mb-6 lg:text-left">
        <h1 className="text-2xl font-bold text-white">{t('createYourAccountHeading', lang)}</h1>
        <div className="flex items-center justify-center lg:justify-start gap-2 mt-2">
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2.5 py-1 font-semibold capitalize">
            {roleLabel(role, lang)}
          </span>
          <button
            type="button"
            onClick={() => setRole(null)}
            className="text-white/60 text-xs hover:text-white transition"
          >
            {t('notRightChange', lang)}
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
          <label className="text-white/70 text-sm block mb-1">{t('fullNameLabel', lang)}</label>
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
          <label className="text-white/70 text-sm block mb-1">{t('email', lang)}</label>
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
          <label className="text-white/70 text-sm block mb-1">{t('phoneLabel', lang)}</label>
          <AuthInput
            type="tel"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="+1 (555) 000-0000"
          />
        </div>

        <div>
          <label className="text-white/70 text-sm block mb-1">{t('passwordFieldLabel', lang)}</label>
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
          <label className="text-white/70 text-sm block mb-1">{t('preferredLanguageLabel', lang)}</label>
          <select
            name="preferred_language"
            value={form.preferred_language}
            onChange={handleChange}
            className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] focus:ring-2 focus:ring-[#12A5A9]/15 transition"
          >
            <option value="en" className="bg-[#0C1A2E]">English</option>
            <option value="es" className="bg-[#0C1A2E]">Español</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
            {alreadyRegistered && (
              <>
                {' '}
                <Link href={`/login${role ? `?role=${role}` : ''}`} className="underline font-medium hover:text-red-300">
                  {t('logInInsteadArrow', lang)}
                </Link>
              </>
            )}
          </div>
        )}

        <label className="flex items-start gap-2.5 text-white/60 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 rounded border-white/20 bg-white/5 accent-[#12A5A9]"
          />
          <span>
            {t('agreeToTermsPrefix', lang)}{' '}
            <Link href={role ? `/terms/${role}` : '/terms'} target="_blank" className="text-[#12A5A9]/80 hover:underline">{t('termsOfService', lang)}</Link>
            {' '}{t('agreeToTermsMiddle', lang)}{' '}
            <Link href="/privacy" target="_blank" className="text-[#12A5A9]/80 hover:underline">{t('privacyPolicy', lang)}</Link>{t('agreeToTermsSuffix', lang)}.
          </span>
        </label>

        <RippleButton
          type="submit"
          disabled={loading || !agreedToTerms}
          className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50 mt-2"
        >
          {loading ? t('creatingAccountDots', lang) : t('createAccountBtn', lang)}
        </RippleButton>

        <p className="text-center text-white/60 text-sm">
          {t('alreadyHaveAccountQ', lang)}{' '}
          <Link href="/login" className="text-[#12A5A9] hover:underline">
            {t('signIn', lang)}
          </Link>
        </p>

      </form>

      {linkOffer && role && (() => {
        const existingRoleLabel = t(ROLE_LABEL_KEY[linkOffer.existingRole], lang)
        const newRoleLabel = t(ROLE_LABEL_KEY[role], lang)
        const body = t('emailAlreadyLinkedBody', lang).replace('{role}', existingRoleLabel).replace('{newRole}', newRoleLabel)
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-30">
            <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-white font-semibold text-lg mb-1.5">{t('emailAlreadyLinkedTitle', lang)}</h3>
              <p className="text-white/60 text-[15px] leading-relaxed mb-4">
                <span className="text-white font-medium">{form.email}</span> {body}
              </p>
              <form onSubmit={handleLinkSubmit} className="space-y-4">
                <div>
                  <label htmlFor="linkPassword" className="text-white/70 text-[15px] block mb-1">
                    {t('confirmPasswordToLink', lang)}
                  </label>
                  <input
                    id="linkPassword"
                    type="password"
                    value={linkPassword}
                    onChange={(e) => setLinkPassword(e.target.value)}
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                    required
                  />
                </div>
                {linkError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {linkError}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setLinkOffer(null); setLinkPassword(''); setLinkError(null) }}
                    disabled={linkSubmitting}
                    className="flex-1 bg-white/5 border border-white/10 text-white/60 text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition disabled:opacity-40"
                  >
                    {t('cancelBtn', lang)}
                  </button>
                  <RippleButton
                    type="submit"
                    disabled={linkSubmitting || !linkPassword}
                    className="flex-[2] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-40"
                  >
                    {linkSubmitting ? t('creatingProfileDots', lang) : t('addProfileAndSwitchBtn', lang)}
                  </RippleButton>
                </div>
              </form>
            </div>
          </div>
        )
      })()}
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
