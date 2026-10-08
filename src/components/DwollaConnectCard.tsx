'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CheckCircleIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

type CustomerStatus = 'not_started' | 'pending' | 'active' | 'suspended'

// Landlord-facing rent-payout setup via Dwolla — replaces
// <StripeConnectCard purpose="rent" /> only (contractors' job payouts stay
// on Stripe, untouched). Dwolla requires landlords to be Verified
// Customers (not the lighter Receive-Only type originally planned) since
// an Unverified renter can't send to a Receive-Only recipient at all —
// confirmed against a real sandbox transfer attempt. That means a short
// identity form (address, DOB, last 4 of SSN) alongside the bank details,
// the same information Stripe Connect already collects for job payouts.
export function DwollaConnectCard() {
  const lang = useLanguage()
  const [status, setStatus] = useState<CustomerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !routingNumber.trim() || !accountNumber.trim() || !accountName.trim() ||
      !address1.trim() || !city.trim() || !state.trim() || !postalCode.trim() ||
      !dateOfBirth || ssnLast4.trim().length !== 4
    ) return
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
      }),
    })
    const fundingData = await fundingRes.json().catch(() => ({}))
    if (!fundingRes.ok) {
      setError(fundingData.error || t('couldNotAddBankAccount', lang))
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setShowForm(false)
    setRoutingNumber('')
    setAccountNumber('')
    setAccountName('')
    setAddress1('')
    setCity('')
    setState('')
    setPostalCode('')
    setDateOfBirth('')
    setSsnLast4('')
    await load()
  }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">{t('getPaidRentTitle', lang)}</h2>
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-10 w-40 bg-white/5 rounded-xl animate-pulse" />
      ) : status === 'active' ? (
        <RippleButton
          onClick={() => setShowForm(true)}
          className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-white/8 transition"
        >
          {t('managePayoutAccount', lang)}
        </RippleButton>
      ) : !showForm ? (
        <RippleButton
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition"
        >
          {t('linkBankAccount', lang)}
        </RippleButton>
      ) : null}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <p className="text-white/40 text-xs bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
            {t('identityVerificationNotice', lang)}
          </p>
          <div>
            <label htmlFor="dwollaAccountName" className="text-white/70 text-sm block mb-1">{t('bankAccountNameLabel', lang)}</label>
            <input
              id="dwollaAccountName"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
              required
            />
          </div>
          <div>
            <label htmlFor="dwollaRouting" className="text-white/70 text-sm block mb-1">{t('routingNumberLabel', lang)}</label>
            <input
              id="dwollaRouting"
              type="text"
              inputMode="numeric"
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
              required
            />
          </div>
          <div>
            <label htmlFor="dwollaAccount" className="text-white/70 text-sm block mb-1">{t('accountNumberLabel', lang)}</label>
            <input
              id="dwollaAccount"
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
              required
            />
          </div>
          <div>
            <label htmlFor="dwollaAccountType" className="text-white/70 text-sm block mb-1">{t('accountTypeLabel', lang)}</label>
            <select
              id="dwollaAccountType"
              value={bankAccountType}
              onChange={(e) => setBankAccountType(e.target.value as 'checking' | 'savings')}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="checking" className="bg-[#0C1A2E]">{t('checkingOption', lang)}</option>
              <option value="savings" className="bg-[#0C1A2E]">{t('savingsOption', lang)}</option>
            </select>
          </div>
          <div>
            <label htmlFor="dwollaAddress1" className="text-white/70 text-sm block mb-1">{t('streetAddressLabel', lang)}</label>
            <input
              id="dwollaAddress1"
              type="text"
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dwollaCity" className="text-white/70 text-sm block mb-1">{t('cityLabel', lang)}</label>
              <input
                id="dwollaCity"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
                required
              />
            </div>
            <div>
              <label htmlFor="dwollaState" className="text-white/70 text-sm block mb-1">{t('stateLabel', lang)}</label>
              <input
                id="dwollaState"
                type="text"
                maxLength={2}
                placeholder={t('statePlaceholder', lang)}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="dwollaZip" className="text-white/70 text-sm block mb-1">{t('zipCodeLabel', lang)}</label>
            <input
              id="dwollaZip"
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dwollaDob" className="text-white/70 text-sm block mb-1">{t('dateOfBirthLabel', lang)}</label>
              <input
                id="dwollaDob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
                required
              />
            </div>
            <div>
              <label htmlFor="dwollaSsn" className="text-white/70 text-sm block mb-1">{t('ssnLast4Label', lang)}</label>
              <input
                id="dwollaSsn"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={ssnLast4}
                onChange={(e) => setSsnLast4(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#12A5A9] transition"
                required
              />
            </div>
          </div>
          <RippleButton
            type="submit"
            disabled={submitting}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? t('redirecting', lang) : t('saveBankAccount', lang)}
          </RippleButton>
        </form>
      )}
    </ScrollReveal>
  )
}
