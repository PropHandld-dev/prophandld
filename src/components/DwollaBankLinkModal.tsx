'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { RippleButton } from '@/components/RippleButton'
import { BankTrustNotice } from '@/components/BankTrustNotice'
import { CheckCircleIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

type Status = { customerStatus: string; fundingSourceStatus: string }
type Step = 'intro' | 'connecting' | 'manual' | 'verify' | 'success'

// Renter-side bank linking for paying rent via Dwolla. Primary path is
// instant verification (Plaid, via Dwolla's Exchange Sessions) — the
// funding source comes back already verified, no waiting. A manual
// routing/account-number entry (then the old micro-deposit round trip)
// stays as a fallback for a bank Plaid can't reach, or if instant
// verification errors out.
export function DwollaBankLinkModal({
  onClose,
  onLinked,
}: {
  onClose: () => void
  onLinked: () => void
}) {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Status | null>(null)
  const [step, setStep] = useState<Step>('intro')
  const [viaInstant, setViaInstant] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [bankAccountType, setBankAccountType] = useState<'checking' | 'savings'>('checking')
  const [accountName, setAccountName] = useState('')
  const [amount1, setAmount1] = useState('')
  const [amount2, setAmount2] = useState('')

  const load = async () => {
    try {
      const res = await fetch('/api/dwolla/customer/status')
      const data = await res.json()
      const next: Status = res.ok ? data : { customerStatus: 'not_started', fundingSourceStatus: 'none' }
      setStatus(next)
      // A returning renter whose funding source is already mid-verification
      // (they linked manually, closed the modal, and came back a day later
      // with the deposit amounts in hand) should land straight on the
      // verify step, not be sent back through earlier screens again.
      if (next.fundingSourceStatus === 'pending') setStep('verify')
    } catch {
      setStatus({ customerStatus: 'not_started', fundingSourceStatus: 'none' })
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const bankDetailsValid = routingNumber.trim() && accountNumber.trim() && accountName.trim()

  // --- Instant verification (Plaid via Dwolla Exchange Sessions) ---
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [plaidError, setPlaidError] = useState<string | null>(null)
  const [exchanging, setExchanging] = useState(false)

  const [connectAttempt, setConnectAttempt] = useState(0)

  useEffect(() => {
    if (step !== 'connecting' || linkToken || exchanging) return
    setPlaidError(null)
    fetch('/api/dwolla/exchange-session/create', { method: 'POST' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || t('couldNotAddBankAccount', lang))
        setLinkToken(data.linkToken as string)
      })
      .catch((err) => setPlaidError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, connectAttempt])

  const onPlaidSuccess = useCallback(
    async (publicToken: string | null, metadata: { institution: { name: string } | null; accounts: Array<{ name: string; subtype: string }> }) => {
      if (!publicToken) return
      setExchanging(true)
      setPlaidError(null)
      const account = metadata.accounts?.[0]
      const resolvedType: 'checking' | 'savings' = account?.subtype === 'savings' ? 'savings' : 'checking'
      const name = account ? `${metadata.institution?.name || 'Bank'} · ${account.name}` : 'Bank account'

      const res = await fetch('/api/dwolla/exchange/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken, bankAccountType: resolvedType, name }),
      })
      const data = await res.json().catch(() => ({}))
      setExchanging(false)
      if (!res.ok) {
        setPlaidError(data.error || t('couldNotAddBankAccount', lang))
        return
      }
      setViaInstant(true)
      await load()
      setStep('success')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang]
  )

  const onPlaidExit = useCallback((plaidErr: { display_message: string | null } | null) => {
    setLinkToken(null)
    if (plaidErr?.display_message) setPlaidError(plaidErr.display_message)
  }, [])

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken || '',
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  })

  useEffect(() => {
    if (plaidReady && linkToken) openPlaid()
  }, [plaidReady, linkToken, openPlaid])

  const handleLinkAccount = async () => {
    setSubmitting(true)
    setError(null)

    const createRes = await fetch('/api/dwolla/customer/create', { method: 'POST' })
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
    await load()
    setStep('verify')
  }

  const handleVerify = async () => {
    const a1 = Number(amount1)
    const a2 = Number(amount2)
    if (!a1 || !a2) return
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/dwolla/funding-source/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount1: a1, amount2: a2 }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || t('couldNotAddBankAccount', lang))
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setStep('success')
  }

  const active = !loading && status?.customerStatus === 'active' && status?.fundingSourceStatus === 'verified'

  useEffect(() => {
    if (active && step !== 'success') onLinked()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-30">
      <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full max-h-[85vh] overflow-y-auto">
        {loading ? (
          <div className="h-24 animate-pulse" />
        ) : (
          <div className="space-y-4">
            {step === 'intro' && (
              <>
                <h3 className="text-white font-semibold text-lg">{t('dwollaRenterIntroTitle', lang)}</h3>
                <p className="text-white/60 text-[15px] leading-relaxed">{t('dwollaRenterIntroBody', lang)}</p>
                <BankTrustNotice extraPoint="trustPointRenterPrivacy" />
                <RippleButton
                  onClick={() => setStep('connecting')}
                  className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition"
                >
                  {t('linkMyBankBtn', lang)}
                </RippleButton>
              </>
            )}

            {step === 'connecting' && (
              <>
                <h3 className="text-white font-semibold text-lg">{t('instantLinkTitle', lang)}</h3>
                <p className="text-white/60 text-[15px] leading-relaxed">{t('instantLinkBody', lang)}</p>
                {plaidError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {plaidError}
                  </div>
                )}
                <div className="flex flex-col items-center py-4 gap-3">
                  <div className="w-8 h-8 border-2 border-[#12A5A9]/30 border-t-[#12A5A9] rounded-full animate-spin" />
                  <p className="text-white/40 text-[13px]">
                    {exchanging ? t('finishingUp', lang) : t('connectingToYourBank', lang)}
                  </p>
                </div>
                <RippleButton
                  onClick={() => {
                    setLinkToken(null)
                    setPlaidError(null)
                    setConnectAttempt((n) => n + 1)
                  }}
                  disabled={submitting || exchanging}
                  className="w-full bg-white/5 border border-white/10 text-white text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition disabled:opacity-40"
                >
                  {t('tryAgainBtn', lang)}
                </RippleButton>
                <button
                  onClick={() => setStep('manual')}
                  className="w-full text-center text-white/50 hover:text-white text-sm transition"
                >
                  {t('enterManuallyInstead', lang)}
                </button>
              </>
            )}

            {step === 'manual' && (
              <>
                <h3 className="text-white font-semibold text-lg">{t('linkBankToPayRentTitle', lang)}</h3>
                <p className="text-white/40 text-[13px]">{t('microDepositsExplainer', lang)}</p>
                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
                <div>
                  <label htmlFor="renterAccountName" className="text-white/70 text-[15px] block mb-1">{t('bankAccountNameLabel', lang)}</label>
                  <input
                    id="renterAccountName"
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                    required
                  />
                  <p className="text-white/40 text-[13px] mt-1">{t('bankAccountNameHelper', lang)}</p>
                </div>
                <div>
                  <label htmlFor="renterRouting" className="text-white/70 text-[15px] block mb-1">{t('routingNumberLabel', lang)}</label>
                  <input
                    id="renterRouting"
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
                  <label htmlFor="renterAccount" className="text-white/70 text-[15px] block mb-1">{t('accountNumberLabel', lang)}</label>
                  <input
                    id="renterAccount"
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
                  <label htmlFor="renterAccountType" className="text-white/70 text-[15px] block mb-1">{t('accountTypeLabel', lang)}</label>
                  <select
                    id="renterAccountType"
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
                    onClick={() => setStep('connecting')}
                    disabled={submitting}
                    className="flex-1 bg-white/5 border border-white/10 text-white/60 text-[15px] font-semibold py-3 rounded-xl hover:bg-white/8 transition disabled:opacity-40"
                  >
                    {t('backBtn', lang)}
                  </RippleButton>
                  <RippleButton
                    onClick={handleLinkAccount}
                    disabled={!bankDetailsValid || submitting}
                    className="flex-[2] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-40"
                  >
                    {submitting ? t('redirecting', lang) : t('saveBankAccount', lang)}
                  </RippleButton>
                </div>
              </>
            )}

            {step === 'verify' && (
              <>
                <h3 className="text-white font-semibold text-lg">{t('verifyBankAccountTitle', lang)}</h3>
                <p className="text-white/60 text-[15px] leading-relaxed">{t('verifyStepIntro', lang)}</p>
                <p className="text-yellow-400/80 text-[13px] bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-3 py-2">
                  {t('bankLinkPendingNotice', lang)}
                </p>
                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
                <div>
                  <label htmlFor="amount1" className="text-white/70 text-[15px] block mb-1">{t('depositAmount1Label', lang)}</label>
                  <input
                    id="amount1"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount1}
                    onChange={(e) => setAmount1(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="amount2" className="text-white/70 text-[15px] block mb-1">{t('depositAmount2Label', lang)}</label>
                  <input
                    id="amount2"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount2}
                    onChange={(e) => setAmount2(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] focus:outline-none focus:border-[#12A5A9] transition"
                    required
                  />
                </div>
                <RippleButton
                  onClick={handleVerify}
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
                >
                  {t('verifyAndContinue', lang)}
                </RippleButton>
              </>
            )}

            {step === 'success' && (
              <>
                <div className="flex flex-col items-center text-center py-2">
                  <div className="w-12 h-12 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mb-3">
                    <CheckCircleIcon className="w-7 h-7 text-[#12A5A9]" />
                  </div>
                  <h3 className="text-white font-semibold text-lg">{t('dwollaSuccessTitle', lang)}</h3>
                  <p className="text-white/60 text-[15px] mt-1">
                    {t(viaInstant ? 'dwollaRenterSuccessBodyInstant' : 'dwollaRenterSuccessBody', lang)}
                  </p>
                </div>
                <RippleButton
                  onClick={onLinked}
                  className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[15px] font-semibold py-3 rounded-xl hover:opacity-90 transition"
                >
                  {t('done', lang)}
                </RippleButton>
              </>
            )}
          </div>
        )}

        {step !== 'success' && (
          <button
            onClick={onClose}
            className="w-full text-center text-white/50 hover:text-white text-sm mt-4 transition"
          >
            {t('cancel', lang)}
          </button>
        )}
      </div>
    </div>
  )
}
