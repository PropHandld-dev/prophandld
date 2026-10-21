'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CheckCircleIcon, LockIcon } from '@/components/icons'
import { BankTrustNotice } from '@/components/BankTrustNotice'
import { PaymentTrustBadge } from '@/components/PaymentTrustBadge'
import { useLanguage, t } from '@/lib/i18n'

type CustomerStatus = 'not_started' | 'pending' | 'active' | 'suspended'
type Step = 'reauth' | 'mfa' | 'intro' | 'bank' | 'identity' | 'review' | 'success'

// Landlord-facing rent-payout setup via Dwolla — replaces
// <StripeConnectCard purpose="rent" /> only (contractors' job payouts stay
// on Stripe, untouched). Dwolla requires landlords to be Verified
// Customers (not the lighter Receive-Only type originally planned) since
// an Unverified renter can't send to a Receive-Only recipient at all —
// confirmed against a real sandbox transfer attempt. That means a short
// identity form (address, DOB, last 4 of SSN) alongside the bank details,
// the same information Stripe Connect already collects for job payouts.
//
// Broken into a one-thing-at-a-time wizard (bank details, then identity,
// then a plain-language review) rather than a single nine-field form —
// this is the only point in the app where someone is asked for an SSN, so
// it needs to read as unhurried and trustworthy, not like a wall of boxes
// to fill in as fast as possible.
export function DwollaConnectCard() {
  const lang = useLanguage()
  const [status, setStatus] = useState<CustomerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [bankAccountType, setBankAccountType] = useState<'checking' | 'savings'>('checking')
  const [accountName, setAccountName] = useState('')
  const [address1, setAddress1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [ssnLast4, setSsnLast4] = useState('')
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthSubmitting, setReauthSubmitting] = useState(false)
  // Accounts with 2FA enrolled go through this instead of the password
  // step above — see mfaStepUpStatus's comment in src/lib/reauth.ts.
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSubmitting, setMfaSubmitting] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/dwolla/customer/status')
      const data = await res.json()
      setStatus(res.ok ? data.customerStatus : 'not_started')
    } catch {
      setStatus('not_started')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const resetForm = () => {
    setStep(null)
    setError(null)
    setRoutingNumber('')
    setAccountNumber('')
    setAccountName('')
    setAddress1('')
    setCity('')
    setState('')
    setPostalCode('')
    setDateOfBirth('')
    setSsnLast4('')
    setReauthPassword('')
    setMfaCode('')
  }

  // Decides which step-up this account needs before opening the
  // bank-details wizard for an already-active payout account — reads the
  // already-loaded session, no network round trip to our own backend.
  const handleManageClick = async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') {
      setStep('intro') // already stepped up earlier this session
      return
    }
    if (aal?.nextLevel === 'aal2') {
      setStep('mfa')
      return
    }
    setStep('reauth')
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mfaCode.trim().length === 0) return
    setMfaSubmitting(true)
    setError(null)

    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const factor = factorsData?.totp?.find((f) => f.status === 'verified')
    if (!factor) {
      setError(t('twoFactorVerifyChallengeError', lang))
      setMfaSubmitting(false)
      return
    }
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challengeError || !challenge) {
      setError(t('twoFactorVerifyChallengeError', lang))
      setMfaSubmitting(false)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: mfaCode.trim() })
    if (verifyError) {
      setError(t('twoFactorCodeMismatchError', lang))
      setMfaSubmitting(false)
      return
    }

    setMfaCode('')
    setMfaSubmitting(false)
    // The session is now aal2 — handleFinalSubmit's own call below doesn't
    // need reauthPassword for this account, the server accepts on aal2 alone.
    setStep('intro')
  }

  // Re-linking an already-active payout account is the one action in this
  // card that can redirect real money to a new destination — worth the
  // extra step of re-proving it's actually the account owner typing,
  // same bar as changing your password (see profile/page.tsx), before even
  // opening the bank-details form. First-time setup skips this: there's
  // nothing to hijack yet.
  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault()
    setReauthSubmitting(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setError(t('couldNotStartPayoutSetup', lang))
      setReauthSubmitting(false)
      return
    }
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: reauthPassword })
    if (verifyError) {
      setError(t('currentPasswordIncorrect', lang))
      setReauthSubmitting(false)
      return
    }
    setReauthSubmitting(false)
    // Deliberately NOT cleared here — the wizard has several more steps
    // (bank details, identity, review) before the actual re-link happens
    // in handleFinalSubmit, which forwards this password so the server can
    // re-verify it too (see funding-source/add). A client-side-only check
    // can't stop someone calling that route directly with a stolen session
    // token, no password required, so the server has to check it for real.
    setStep('bank')
  }

  const bankDetailsValid = routingNumber.trim() && accountNumber.trim() && accountName.trim()
  const identityValid = address1.trim() && city.trim() && state.trim() && postalCode.trim() && dateOfBirth && ssnLast4.trim().length === 4

  const handleFinalSubmit = async () => {
    setSubmitting(true)
    setError(null)

    const createRes = await fetch('/api/dwolla/customer/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address1: address1.trim(),
        city: city.trim(),
        state: state.trim(),
        postalCode: postalCode.trim(),
        dateOfBirth,
        ssnLast4: ssnLast4.trim(),
      }),
    })
    const createData = await createRes.json().catch(() => ({}))
    if (!createRes.ok) {
      setError(createData.error || t('couldNotStartPayoutSetup', lang))
      setSubmitting(false)
      setStep('identity')
      return
    }

    const fundingRes = await fetch('/api/dwolla/funding-source/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routingNumber: routingNumber.trim(),
        accountNumber: accountNumber.trim(),
        bankAccountType,
        name: accountName.trim(),
        password: reauthPassword,
      }),
    })
    const fundingData = await fundingRes.json().catch(() => ({}))
    if (!fundingRes.ok) {
      if (fundingRes.status === 428 && fundingData.error === 'mfa_required') {
        // Edge case — aal2 was satisfied when the wizard started but isn't
        // by the time this final submit runs (e.g. a long-idle tab).
        setSubmitting(false)
        setStep('mfa')
        return
      }
      if (fundingRes.status === 401) {
        setError(t('currentPasswordIncorrect', lang))
        setReauthPassword('')
        setSubmitting(false)
        setStep('reauth')
        return
      }
      setError(fundingData.error || t('couldNotAddBankAccount', lang))
      setSubmitting(false)
      setStep('bank')
      return
    }

    setReauthPassword('')
    setSubmitting(false)
    setStep('success')
    await load()
  }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">{t('getPaidRentBankTitle', lang)}</h2>
        {!loading && status && (
          <span className={
            status === 'active'
              ? 'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]'
              : status === 'pending'
                ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400'
                : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/50'
          }>
            {status === 'active' && <CheckCircleIcon className="w-3 h-3" />}
            {status === 'active' ? t('payoutsActiveBadge', lang) : status === 'pending' ? t('setupInProgress', lang) : t('notSetUp', lang)}
          </span>
        )}
      </div>
      <p className="text-white/50 text-sm mb-4">{t('getPaidRentDwollaBody', lang)}</p>

      {loading ? (
        <div className="h-10 w-40 bg-white/5 rounded-xl animate-pulse" />
      ) : step === null ? (
        status === 'active' ? (
          <RippleButton
            onClick={handleManageClick}
            className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-white/8 transition"
          >
            {t('managePayoutAccount', lang)}
          </RippleButton>
        ) : (
          <RippleButton
            onClick={() => setStep('intro')}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition"
          >
            {t('linkBankAccount', lang)}
          </RippleButton>
        )
      ) : (
        <div className="mt-4 space-y-4">
          {step === 'reauth' && (
            <form onSubmit={handleReauth} className="space-y-4">
              <h3 className="text-white font-semibold text-lg">{t('reauthToManagePayoutTitle', lang)}</h3>
              <p className="text-white/60 text-[14px] leading-relaxed">{t('reauthToManagePayoutBody', lang)}</p>
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <div>
                <label htmlFor="dwollaReauthPassword" className="text-white/70 text-[15px] block mb-1 flex items-center gap-1.5">
                  <LockIcon className="w-3.5 h-3.5" />
                  {t('currentPassword', lang)}
                </label>
                <input
                  id="dwollaReauthPassword"
                  type="password"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                  required
                />
              </div>
              <div className="flex gap-3 pt-1">
                <RippleButton
                  type="button"
                  onClick={resetForm}
                  disabled={reauthSubmitting}
                  className="flex-1 bg-white/5 border border-white/10 text-white/60 text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition disabled:opacity-40"
                >
                  {t('cancel', lang)}
                </RippleButton>
                <RippleButton
                  type="submit"
                  disabled={reauthSubmitting || !reauthPassword}
                  className="flex-[2] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-40"
                >
                  {reauthSubmitting ? t('verifyingDots', lang) : t('continueBtn', lang)}
                </RippleButton>
              </div>
            </form>
          )}

          {step === 'mfa' && (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <h3 className="text-white font-semibold text-lg">{t('mfaStepUpTitle', lang)}</h3>
              <p className="text-white/60 text-[14px] leading-relaxed">{t('mfaStepUpBody', lang)}</p>
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <div>
                <label htmlFor="dwollaMfaCode" className="text-white/70 text-[15px] block mb-1 flex items-center gap-1.5">
                  <LockIcon className="w-3.5 h-3.5" />
                  {t('twoFactorAuthTitle', lang)}
                </label>
                <input
                  id="dwollaMfaCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-lg tracking-[0.3em] font-semibold focus:outline-none focus:border-[#12A5A9] transition"
                  required
                />
              </div>
              <div className="flex gap-3 pt-1">
                <RippleButton
                  type="button"
                  onClick={resetForm}
                  disabled={mfaSubmitting}
                  className="flex-1 bg-white/5 border border-white/10 text-white/60 text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition disabled:opacity-40"
                >
                  {t('cancel', lang)}
                </RippleButton>
                <RippleButton
                  type="submit"
                  disabled={mfaSubmitting || mfaCode.length === 0}
                  className="flex-[2] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-40"
                >
                  {mfaSubmitting ? t('verifyingDots', lang) : t('continueBtn', lang)}
                </RippleButton>
              </div>
            </form>
          )}

          {step === 'intro' && (
            <>
              <h3 className="text-white font-semibold text-lg">{t('dwollaLandlordIntroTitle', lang)}</h3>
              <p className="text-white/60 text-[15px] leading-relaxed">{t('dwollaLandlordIntroBody', lang)}</p>
              <BankTrustNotice />
              <div className="flex gap-3 pt-1">
                <RippleButton
                  onClick={resetForm}
                  className="flex-1 bg-white/5 border border-white/10 text-white/60 text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition"
                >
                  {t('cancel', lang)}
                </RippleButton>
                <RippleButton
                  onClick={() => setStep('bank')}
                  className="flex-[2] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition"
                >
                  {t('getStartedBtn', lang)}
                </RippleButton>
              </div>
            </>
          )}

          {step === 'bank' && (
            <>
              <h3 className="text-white font-semibold text-lg">{t('bankDetailsStepTitle', lang)}</h3>
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <div>
                <label htmlFor="dwollaAccountName" className="text-white/70 text-[15px] block mb-1">{t('bankAccountNameLabel', lang)}</label>
                <input
                  id="dwollaAccountName"
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                  required
                />
                <p className="text-white/40 text-[13px] mt-1">{t('bankAccountNameHelper', lang)}</p>
              </div>
              <div>
                <label htmlFor="dwollaRouting" className="text-white/70 text-[15px] block mb-1">{t('routingNumberLabel', lang)}</label>
                <input
                  id="dwollaRouting"
                  type="text"
                  inputMode="numeric"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                  required
                />
                <p className="text-white/40 text-[13px] mt-1">{t('routingNumberHelper', lang)}</p>
              </div>
              <div>
                <label htmlFor="dwollaAccount" className="text-white/70 text-[15px] block mb-1">{t('accountNumberLabel', lang)}</label>
                <input
                  id="dwollaAccount"
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                  required
                />
                <p className="text-white/40 text-[13px] mt-1">{t('accountNumberHelper', lang)}</p>
              </div>
              <div>
                <label htmlFor="dwollaAccountType" className="text-white/70 text-[15px] block mb-1">{t('accountTypeLabel', lang)}</label>
                <select
                  id="dwollaAccountType"
                  value={bankAccountType}
                  onChange={(e) => setBankAccountType(e.target.value as 'checking' | 'savings')}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                >
                  <option value="checking" className="bg-[#0C1A2E]">{t('checkingOption', lang)}</option>
                  <option value="savings" className="bg-[#0C1A2E]">{t('savingsOption', lang)}</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <RippleButton
                  onClick={resetForm}
                  className="flex-1 bg-white/5 border border-white/10 text-white/60 text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition"
                >
                  {t('cancel', lang)}
                </RippleButton>
                <RippleButton
                  onClick={() => bankDetailsValid && setStep('identity')}
                  disabled={!bankDetailsValid}
                  className="flex-[2] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-40"
                >
                  {t('continueBtn', lang)}
                </RippleButton>
              </div>
              <PaymentTrustBadge provider="dwolla" />
            </>
          )}

          {step === 'identity' && (
            <>
              <h3 className="text-white font-semibold text-lg">{t('identityStepTitle', lang)}</h3>
              <p className="text-white/60 text-[14px] leading-relaxed">{t('identityStepBody', lang)}</p>
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <div>
                <label htmlFor="dwollaAddress1" className="text-white/70 text-[15px] block mb-1">{t('streetAddressLabel', lang)}</label>
                <input
                  id="dwollaAddress1"
                  type="text"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dwollaCity" className="text-white/70 text-[15px] block mb-1">{t('cityLabel', lang)}</label>
                  <input
                    id="dwollaCity"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="dwollaState" className="text-white/70 text-[15px] block mb-1">{t('stateLabel', lang)}</label>
                  <input
                    id="dwollaState"
                    type="text"
                    maxLength={2}
                    placeholder={t('statePlaceholder', lang)}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="dwollaZip" className="text-white/70 text-[15px] block mb-1">{t('zipCodeLabel', lang)}</label>
                <input
                  id="dwollaZip"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dwollaDob" className="text-white/70 text-[15px] block mb-1">{t('dateOfBirthLabel', lang)}</label>
                  <input
                    id="dwollaDob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="dwollaSsn" className="text-white/70 text-[15px] block mb-1">{t('ssnLast4Label', lang)}</label>
                  <input
                    id="dwollaSsn"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={ssnLast4}
                    onChange={(e) => setSsnLast4(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                    required
                  />
                  <p className="text-white/40 text-[13px] mt-1">{t('ssnLast4Helper', lang)}</p>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <RippleButton
                  onClick={() => setStep('bank')}
                  className="flex-1 bg-white/5 border border-white/10 text-white/60 text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition"
                >
                  {t('backBtn', lang)}
                </RippleButton>
                <RippleButton
                  onClick={() => identityValid && setStep('review')}
                  disabled={!identityValid}
                  className="flex-[2] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-40"
                >
                  {t('reviewAndFinishBtn', lang)}
                </RippleButton>
              </div>
              <PaymentTrustBadge provider="dwolla" />
            </>
          )}

          {step === 'review' && (
            <>
              <h3 className="text-white font-semibold text-lg">{t('reviewStepTitle', lang)}</h3>
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-white/40 text-[13px]">{t('reviewBankLabel', lang)}</p>
                  <p className="text-white text-[15px] font-medium">
                    {accountName} — {bankAccountType === 'checking' ? t('checkingOption', lang) : t('savingsOption', lang)}, {t('accountEndingIn', lang)} {accountNumber.slice(-4)}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 text-[13px]">{t('reviewAddressLabel', lang)}</p>
                  <p className="text-white text-[15px] font-medium">{address1}, {city}, {state} {postalCode}</p>
                </div>
                <div>
                  <p className="text-white/40 text-[13px]">{t('dateOfBirthLabel', lang)}</p>
                  <p className="text-white text-[15px] font-medium">
                    {dateOfBirth && new Date(dateOfBirth + 'T00:00:00').toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <RippleButton
                  onClick={() => setStep('identity')}
                  disabled={submitting}
                  className="flex-1 bg-white/5 border border-white/10 text-white/60 text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition disabled:opacity-40"
                >
                  {t('backBtn', lang)}
                </RippleButton>
                <RippleButton
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="flex-[2] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
                >
                  {submitting ? t('redirecting', lang) : t('confirmAndLinkBtn', lang)}
                </RippleButton>
              </div>
              <PaymentTrustBadge provider="dwolla" />
            </>
          )}

          {step === 'success' && (
            <>
              <div className="flex flex-col items-center text-center py-2">
                <div className="w-12 h-12 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mb-3">
                  <CheckCircleIcon className="w-7 h-7 text-[#12A5A9]" />
                </div>
                <h3 className="text-white font-semibold text-lg">{t('dwollaSuccessTitle', lang)}</h3>
                <p className="text-white/60 text-[15px] mt-1">{t('dwollaLandlordSuccessBody', lang)}</p>
              </div>
              <RippleButton
                onClick={resetForm}
                className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition"
              >
                {t('done', lang)}
              </RippleButton>
            </>
          )}
        </div>
      )}
    </ScrollReveal>
  )
}
