'use client'

import { useState, useEffect, Suspense } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, consumeFreshSignIn, consumeAuthError } from '@/lib/supabase'
import { setAppMetadataRole } from '@/lib/setAppMetadataRole'
import { getAccountRole } from '@/lib/accountRole'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { AuthLayout } from '@/components/AuthLayout'
import { Logo } from '@/components/Logo'
import { AuthInput } from '@/components/AuthInput'
import { MailIcon, LockIcon, CheckCircleIcon } from '@/components/icons'
import type { Role } from '@/components/RolePicker'
import { getLandlordIds } from '@/lib/landlordIds'
import { useLanguage, t, roleLabel, type Lang } from '@/lib/i18n'

// Purely cosmetic — sets which flavor of copy shows on the brand panel.
// The actual post-login redirect always uses the account's real stored role.
function getRoleContent(role: Role, lang: Lang): { headline: string; subtext: string; checklist: string[] } {
  if (role === 'landlord') {
    return {
      headline: t('loginWelcomeBackHeadline', lang),
      subtext: t('loginSubtextLandlord', lang),
      checklist: [t('loginChecklistLandlord1', lang), t('loginChecklistLandlord2', lang), t('loginChecklistLandlord3', lang)],
    }
  }
  if (role === 'renter') {
    return {
      headline: t('loginWelcomeBackHeadline', lang),
      subtext: t('loginSubtextRenter', lang),
      checklist: [t('loginChecklistRenter1', lang), t('loginChecklistRenter2', lang), t('loginChecklistRenter3', lang), t('loginChecklistRenter4', lang)],
    }
  }
  return {
    headline: t('loginWelcomeBackHeadline', lang),
    subtext: t('loginSubtextContractor', lang),
    checklist: [t('loginChecklistContractor1', lang), t('loginChecklistContractor2', lang), t('loginChecklistContractor3', lang)],
  }
}

const VALID_ROLES: Role[] = ['landlord', 'renter', 'contractor']

// The public.users row for a brand-new account is created by a database
// trigger off auth.users, not by this app — so a request landing right after
// signup can genuinely beat that trigger. The endpoint tells this case apart
// (409 + notReady) from "already welcomed," so it's worth one retry after a
// beat instead of silently giving up on a real first activation. A plain 500
// means the send itself failed (Resend hiccup, rate limit) — the endpoint
// releases its claim on that outcome, so it's worth exactly the same one
// retry rather than leaving a real first activation to just silently not
// get an email.
async function sendWelcomeEmailWithRetry() {
  try {
    const res = await fetch('/api/auth/welcome', { method: 'POST' })
    if (res.status === 409 || res.status === 500) {
      const body = res.status === 409 ? await res.json().catch(() => ({})) : null
      if (res.status === 500 || body?.notReady) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        await fetch('/api/auth/welcome', { method: 'POST' })
      }
    }
  } catch (err) {
    console.error('Error sending welcome email:', err)
  }
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lang = useLanguage()
  const initialRole = searchParams.get('role') as Role | null
  const [role, setRole] = useState<Role | null>(
    initialRole && VALID_ROLES.includes(initialRole) ? initialRole : null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // True until the initial "is there already a session?" check finishes —
  // covers a tenant/contractor who clicked an email-confirmation link
  // rather than typing their password in on this page. Starts true so the
  // login form never flashes for someone about to be redirected straight
  // through.
  const [checkingSession, setCheckingSession] = useState(true)
  // Set only when the session on this page load came from actually
  // clicking an email-confirmation link (see the hash check below) — not
  // for an ordinary already-signed-in visit to /login, which should still
  // redirect straight through with no interruption.
  const [justVerifiedUser, setJustVerifiedUser] = useState<User | null>(null)
  const [continuing, setContinuing] = useState(false)
  // A rejected confirmation/reset link (expired, or already used once)
  // lands here with nothing to show for it otherwise — same blank sign-in
  // screen as a plain visit, with zero indication a link even existed,
  // let alone that it failed.
  const [linkError, setLinkError] = useState<{ code: string | null; description: string | null } | null>(null)
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  // MFA is opt-in for every role (unlike admin, where it's mandatory) — set
  // up from Profile settings. A password-only account never sees any of
  // this; it only activates for someone who already enrolled a verified
  // authenticator, same check the admin login page already does.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaUser, setMfaUser] = useState<User | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaVerifying, setMfaVerifying] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)

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
    // getAccountRole() prefers app_metadata.role (authoritative, server-set)
    // and only falls back to user_metadata.role for the one case where
    // app_metadata genuinely doesn't exist yet: a brand-new account's very
    // first activation, right here, before setAppMetadataRole below has
    // ever run for this user. A real report confirmed this used to read
    // user_metadata.role only, with no fallback — any already-active
    // account whose user_metadata.role was ever missing or stale had
    // nowhere to land and fell through to the final `else` (the plain
    // landing page) below, with no way to self-heal on a later visit
    // either, since the landing page's own redirect had the same gap
    // (see accountRole.ts for the full story).
    const accountRole = getAccountRole(user)
    // Set by the tenancy/co-owner link-invite calls below when a pending
    // invite matches this account's phone number but couldn't auto-link
    // because that phone isn't verified yet — carried through to the
    // dashboard redirect as a query param so it can nudge the person to
    // verify instead of silently doing nothing.
    let tenancyNeedsPhone = false
    let coOwnerNeedsPhone = false
    if (isFirstActivation && (accountRole === 'landlord' || accountRole === 'renter' || accountRole === 'contractor')) {
      sendWelcomeEmailWithRetry()
      // Same "first activation" moment signup couldn't use directly (no
      // session existed yet when the role was chosen, since email
      // confirmation defers the real session to here) — see
      // setAppMetadataRole's own comment for why this has to happen
      // server-side rather than trusting user_metadata.role going forward.
      // Awaited: the landlord branch below calls co-owner/link-invite next,
      // which gates on this having already landed — losing that race used
      // to send a co-owner-invited landlord to "add your first property"
      // instead of their co-owned portfolio, on their very first login.
      await setAppMetadataRole(accountRole)
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
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          console.error('Error auto-linking invited tenancy on login:', body.error)
        } else if (body.phoneMatchNeedsVerification) {
          tenancyNeedsPhone = true
        }
      } catch (err) {
        console.error('Error checking pending invite on login:', err)
      }
    }
    if (accountRole === 'contractor') {
      // Same bug, same fix, for a contractor a landlord invited: closing
      // out the invite used to only happen right after signup too.
      fetch('/api/contractor/accept-invite', { method: 'POST', keepalive: true }).catch((err) =>
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
      // Safe to call every login: a no-op once already linked, same
      // reasoning as the renter tenancy-invite auto-link right below.
      try {
        const res = await fetch('/api/co-owner/link-invite', { method: 'POST' })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          console.error('Error auto-linking invited co-ownership on login:', body.error)
        } else if (body.phoneMatchNeedsVerification) {
          coOwnerNeedsPhone = true
        }
      } catch (err) {
        console.error('Error checking pending co-owner invite on login:', err)
      }

      // A co-owner has no properties of their own — counting only their
      // own owner_user_id rows would wrongly send them to "add your first
      // property" even though the portfolio they co-manage has plenty.
      const landlordIds = await getLandlordIds(supabase, user.id)
      const { count } = await supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .in('owner_user_id', landlordIds)
      if (!count) router.replace('/landlord/properties/new?onboarding=1')
      else router.replace(coOwnerNeedsPhone ? '/landlord?pendingInviteNeedsPhone=1' : '/landlord')
    }
    else if (accountRole === 'renter') router.replace(tenancyNeedsPhone ? '/renter?pendingInviteNeedsPhone=1' : '/renter')
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      // getSession() waits for the client's own startup work to finish
      // first, which includes processing any auth tokens in the URL — so
      // by the time this resolves, a SIGNED_IN event from a confirmation
      // link has already had its chance to fire and be captured.
      const freshUser = consumeFreshSignIn()
      // Set by signup's OTP-code flow right before it redirects here — a
      // synchronous, same-tick fact rather than something that depends on
      // consumeFreshSignIn() having already caught a SIGNED_IN event that
      // Supabase can dispatch asynchronously. See the comment where it's
      // set for why that race is real and why losing it used to be silent.
      let justActivated = false
      try {
        if (sessionStorage.getItem('ph_just_activated') === '1') {
          justActivated = true
          sessionStorage.removeItem('ph_just_activated')
        }
      } catch {}
      if (session?.user && ((freshUser && freshUser.id === session.user.id) || justActivated)) {
        setJustVerifiedUser(session.user)
        setCheckingSession(false)
      } else if (session?.user) {
        // Already signed in, but not from a fresh confirmation-link
        // session (that's the branch above, gated on consumeFreshSignIn()
        // matching) — just an ordinary visit to /login while already
        // authenticated. Redirect straight through; this is NOT a first
        // activation, and must not be treated as one. Passing `true` here
        // used to fire the welcome email (and welcome-only side effects)
        // on any such visit, for anyone whose welcomed_at hadn't been
        // stamped yet — e.g. a contractor landing back on /login via a
        // stale or deep-linked URL well after their real signup.
        completeSignIn(session.user)
      } else {
        setLinkError(consumeAuthError())
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
      // signInWithPassword() fires the same SIGNED_IN event a confirmation
      // link does, setting the same module-level "just signed in" signal —
      // discard it here so it can't later stale-match an ordinary revisit
      // to /login while still authenticated (same tab, no reload) and get
      // mistaken for "just clicked a confirmation link," which used to
      // show the "Email verified!" screen and re-fire the welcome-email
      // check for a login that has nothing to do with either.
      consumeFreshSignIn()

      // Optional MFA: only a password alone proves nothing more if this
      // account enrolled an authenticator — same check the admin login
      // page already does, just not mandatory here. A session's AAL
      // already reflects this challenge for as long as the session lasts,
      // so this only ever runs right after a fresh password sign-in, not
      // on every page load.
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const verifiedTotp = factorsData?.totp?.find((f) => f.status === 'verified')
      if (verifiedTotp) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id })
        if (challengeError || !challenge) {
          setError(t('couldNotStartAuthCheck', lang))
          setLoading(false)
          return
        }
        setMfaFactorId(verifiedTotp.id)
        setMfaUser(data.user)
        setLoading(false)
        return
      }

      await completeSignIn(data.user)
    }

    setLoading(false)
  }

  // Optional, faster alternative to typing a password — still beta on
  // Supabase's side (see PasskeyCard.tsx), offered alongside the password
  // form, never replacing it. Mirrors handleLogin's own MFA check exactly
  // rather than assuming a passkey alone satisfies an account's TOTP
  // requirement — Supabase's docs don't confirm passkey sign-in elevates
  // AAL the same way an explicit MFA challenge does, so this stays
  // conservative and consistent with the password path either way.
  const handlePasskeyLogin = async () => {
    setLoading(true)
    setError(null)
    // Beta API — until the one-time Supabase Dashboard passkey setup is
    // confirmed done, this method can throw synchronously instead of
    // rejecting as a normal {error} result. Unguarded, that throw landed
    // before any setLoading(false), leaving the whole form (password
    // submit included, since both share this same loading flag) stuck
    // disabled until a manual refresh — the same failure mode as the
    // InactivityGuard sign-out loop, caught here before shipping it live.
    try {
      const { data, error: passkeyError } = await (supabase.auth as any).signInWithPasskey()
      if (passkeyError) {
        setError(passkeyError.message || 'Could not sign in with Face ID / Touch ID.')
        return
      }
      if (data?.user) {
        consumeFreshSignIn()
        const { data: factorsData } = await supabase.auth.mfa.listFactors()
        const verifiedTotp = factorsData?.totp?.find((f) => f.status === 'verified')
        if (verifiedTotp) {
          const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id })
          if (challengeError || !challenge) {
            setError(t('couldNotStartAuthCheck', lang))
            return
          }
          setMfaFactorId(verifiedTotp.id)
          setMfaUser(data.user)
          return
        }
        await completeSignIn(data.user)
      }
    } catch {
      setError(t('faceIdNotAvailableRightNow', lang))
    } finally {
      setLoading(false)
    }
  }

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaFactorId || !mfaUser || mfaCode.trim().length === 0) return
    setMfaVerifying(true)
    setMfaError(null)

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
    if (challengeError || !challenge) {
      setMfaError(t('twoFactorVerifyChallengeError', lang))
      setMfaVerifying(false)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode.trim() })
    if (verifyError) {
      setMfaError(t('twoFactorCodeMismatchError', lang))
      setMfaVerifying(false)
      return
    }

    await completeSignIn(mfaUser)
    setMfaVerifying(false)
  }

  const handleContinue = async () => {
    if (!justVerifiedUser || continuing) return
    setContinuing(true)
    await completeSignIn(justVerifiedUser, true)
  }

  if (mfaUser) {
    return (
      <AuthLayout headline={t('oneMoreStepHeadline', lang)} subtext={t('confirmItsYouSubtext', lang)}>
        <div className="text-center mb-8 lg:text-left">
          <h1 className="text-2xl font-bold text-white">{t('enterAuthenticatorCodeHeading', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">{t('fromAppYouSetUp', lang)}</p>
        </div>
        <form onSubmit={handleMfaVerify} className="space-y-4">
          <AuthInput
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            className="text-center text-lg tracking-[0.3em] font-semibold"
          />
          {mfaError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {mfaError}
            </div>
          )}
          <RippleButton
            type="submit"
            disabled={mfaVerifying || mfaCode.length === 0}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {mfaVerifying ? t('verifyingDots', lang) : t('verifyBtn', lang)}
          </RippleButton>
        </form>
      </AuthLayout>
    )
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
        <div className="text-white/50 text-sm">{t('confirmingAccountDots', lang)}</div>
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
      <AuthLayout headline={t('youreVerifiedHeadline', lang)} subtext={t('oneClickAndYoureIn', lang)}>
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mx-auto mb-5 motion-safe:animate-[popIn_0.5s_ease-out]">
            <CheckCircleIcon className="w-8 h-8 text-[#12A5A9]" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">{t('emailVerifiedHeading', lang)}</h2>
          <p className="text-white/50 text-sm mb-8">{t('accountReadyToGo', lang)}</p>
          <RippleButton
            type="button"
            onClick={handleContinue}
            disabled={continuing}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {continuing ? t('takingYouInDots', lang) : t('continueToDashboardArrow', lang)}
          </RippleButton>
        </div>
      </AuthLayout>
    )
  }

  // Role used to gate the whole form behind a "Who's signing in today?"
  // picker screen — a tap that did nothing but pick which flavor of
  // sidebar copy to show (see ROLE_CONTENT above and the real redirect
  // logic in completeSignIn, which always uses the account's actual
  // stored role regardless of what was clicked here). Every single
  // returning user paid that extra tap for an unused answer. Now the form
  // just shows immediately; role stays purely cosmetic, set only via a
  // ?role= link (e.g. from a role-specific landing page) when present.
  const { headline, subtext, checklist } = role
    ? getRoleContent(role, lang)
    : { headline: t('loginWelcomeBackHeadline', lang), subtext: t('loginDefaultSubtext', lang), checklist: [] }

  return (
    <AuthLayout headline={headline} subtext={subtext} checklist={checklist} showChecklist={!!role}>
      <div className="text-center mb-8 lg:text-left">
        <h1 className="text-2xl font-bold text-white">{t('signIn', lang)}</h1>
        {role && (
          <div className="flex items-center justify-center lg:justify-start gap-2 mt-2">
            <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2.5 py-1 font-semibold capitalize">
              {roleLabel(role, lang)}
            </span>
            <button
              type="button"
              onClick={() => setRole(null)}
              className="text-white/60 text-xs hover:text-white transition"
            >
              {t('notYouChange', lang)}
            </button>
          </div>
        )}
      </div>

      {linkError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
          {linkError.code === 'otp_expired'
            ? t('linkExpiredError', lang)
            : linkError.description?.replace(/\+/g, ' ') || t('linkInvalidError', lang)}
        </div>
      )}

      {/* InactivityGuard redirects here with ?reason=inactive (hadn't
          opened the app in a long time) or ?reason=idle (sat open and
          untouched for a while) — without this, either would just look
          like an unexplained, possibly alarming forced sign-out. Neutral
          styling on purpose: both are expected, routine behavior, not an
          error, and worded differently since they mean different things
          to the person reading it. */}
      {searchParams.get('reason') === 'inactive' && (
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/60 text-sm mb-6">
          {t('signedOutInactiveMessage', lang)}
        </div>
      )}
      {searchParams.get('reason') === 'idle' && (
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/60 text-sm mb-6">
          {t('signedOutIdleMessage', lang)}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">

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
          <label className="text-white/70 text-sm block mb-1">{t('passwordFieldLabel', lang)}</label>
          <AuthInput
            icon={LockIcon}
            type="password"
            name="password"
            required
            value={form.password}
            onChange={handleChange}
            placeholder={t('yourPasswordPlaceholder', lang)}
          />
        </div>

        <div className="text-right">
          <Link href="/forgot-password" className="text-[#12A5A9] text-sm hover:underline">
            {t('forgotPasswordLink', lang)}
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
          {loading ? t('signingInDots', lang) : t('signIn', lang)}
        </RippleButton>

        <button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={loading}
          className="w-full bg-white/5 border border-white/10 text-white/70 font-semibold py-3 rounded-xl transition hover:bg-white/8 disabled:opacity-50 text-sm"
        >
          {t('signInWithFaceIdBtn', lang)}
        </button>
        <p className="text-center text-white/40 text-xs -mt-2">
          {t('firstTimeFaceIdHint', lang)}
        </p>

        <p className="text-center text-white/60 text-sm">
          {t('dontHaveAccountQ', lang)}{' '}
          <Link href="/signup" className="text-[#12A5A9] hover:underline">
            {t('createOneLink', lang)}
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
