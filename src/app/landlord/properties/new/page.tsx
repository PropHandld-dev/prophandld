'use client'

import { useState, useEffect, Suspense } from 'react'
import { SubscribeToAdd } from '@/components/BillingReminder'
import { useBillingStatus, BILLING_ENFORCED } from '@/lib/useBillingStatus'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { geocodeZip } from '@/lib/geocode'
import { BottomTabBar } from '@/components/BottomTabBar'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { AddressAutocomplete, type AutocompletePlace } from '@/components/AddressAutocomplete'
import { isValidZip, checkAddressOnServer } from '@/lib/zipValidation'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { useLanguage, t } from '@/lib/i18n'
import { useConfirm } from '@/lib/useConfirm'
import { createOwnProperty } from '@/lib/landlordSetup'
import { supabase } from '@/lib/supabase'
import { useDraft } from '@/lib/useDraft'
import { DraftNote } from '@/components/DraftNote'

function NewPropertyForm() {
  const router = useRouter()
  const lang = useLanguage()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === '1'
  const billing = useBillingStatus()
  const billingBlocked = BILLING_ENFORCED && billing.needsPayment && billing.trialExpired
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    address: '',
    city: '',
    state: '',
    zip: '',
    property_type: 'residential',
    num_units: '1',
  })
  const [placeGeo, setPlaceGeo] = useState<{ lat: number; lng: number } | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])
  const draft = useDraft({
    name: 'add-property',
    userId,
    value: { form, placeGeo },
    onRestore: (saved) => {
      setForm(saved.form)
      setPlaceGeo(saved.placeGeo)
    },
    isEmpty: (v) => !v.form.address.trim() && !v.form.city.trim() && !v.form.zip.trim(),
  })

  // A property manager can add this property to one of their clients'
  // portfolios instead of their own -- found live: a PM had no way to set
  // up a client's properties at all (the properties RLS insert policy only
  // allows your own portfolio, deliberately). Picking a client routes the
  // save through /api/pm/clients/[portfolioId]/properties, which verifies
  // the PM actually manages that client. Empty for anyone who isn't a PM.
  const [pmClients, setPmClients] = useState<{ portfolioId: string; ownerUserId: string; ownerName: string }[]>([])
  const [forPortfolioId, setForPortfolioId] = useState('')
  useEffect(() => {
    fetch('/api/pm/clients')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list = ((data?.clients || []) as any[])
          .filter((c) => c.status === 'accepted' && c.ownerUserId)
          .map((c) => ({ portfolioId: c.id, ownerUserId: c.ownerUserId, ownerName: c.ownerName }))
        setPmClients(list)
        const preselect = searchParams.get('for')
        if (preselect && list.some((c) => c.portfolioId === preselect)) setForPortfolioId(preselect)
      })
      .catch(() => {})
  }, [searchParams])
  const forClient = pmClients.find((c) => c.portfolioId === forPortfolioId) || null

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleAddressChange = (value: string) => {
    setForm({ ...form, address: value })
    setPlaceGeo(null)
  }

  const handlePlaceSelected = (place: AutocompletePlace) => {
    setForm({
      ...form,
      address: place.address || form.address,
      city: place.city || form.city,
      state: place.state || form.state,
      zip: place.zip || form.zip,
    })
    if (place.lat != null && place.lng != null) {
      setPlaceGeo({ lat: place.lat, lng: place.lng })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!forClient) {
      const res = await createOwnProperty(
        {
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          propertyType: form.property_type,
          numUnits: parseInt(form.num_units),
          geo: placeGeo,
        },
        lang,
        () => confirm({ body: t('addressRegisteredOther', lang) }),
      )
      if ('cancelled' in res) {
        setLoading(false)
        return
      }
      if ('error' in res) {
        setError(res.error)
        setLoading(false)
        return
      }
      draft.clear()
      if (isOnboarding) {
        // Carries a pending PM-request outcome (set by login/page.tsx when
        // this onboarding redirect followed a "Request to be managed"
        // signup) through to the dashboard's PmRequestStatusBanner.
        const pmRequestSent = searchParams.get('pmRequestSent')
        const pmRequestFailed = searchParams.get('pmRequestFailed')
        const extra = pmRequestSent === '1' ? '?pmRequestSent=1' : pmRequestFailed === '1' ? '?pmRequestFailed=1' : ''
        router.push(`/landlord${extra}`)
      } else {
        router.push(`/landlord/properties/${res.propertyId}`)
      }
      return
    }

    // A PM adding a property to a client's portfolio: same checks, saved
    // through /api/pm/clients/[portfolioId]/properties, which verifies the
    // PM actually manages that client.
    if (form.zip && !isValidZip(form.zip)) {
      setError(t('invalidZipFormat', lang))
      setLoading(false)
      return
    }
    const addressCheck = await checkAddressOnServer({ city: form.city, state: form.state, zip: form.zip })
    if (addressCheck.error) {
      setError(addressCheck.error)
      setLoading(false)
      return
    }
    const normalizedState = addressCheck.state

    const dupRes = await fetch('/api/landlord/properties/check-duplicate-address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: form.address, city: form.city, state: normalizedState, forOwnerId: forClient.ownerUserId }),
    })
    const dup = await dupRes.json().catch(() => ({}))
    if (dup.ownedByMe) {
      setError(t('alreadyHavePropertyAddress', lang))
      setLoading(false)
      return
    }
    if (dup.ownedByOther && !(await confirm({ body: t('addressRegisteredOther', lang) }))) {
      setLoading(false)
      return
    }

    const geo = placeGeo ?? (form.zip ? await geocodeZip(form.zip) : null)
    const res = await fetch(`/api/pm/clients/${forClient.portfolioId}/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: form.address,
        city: form.city,
        state: normalizedState,
        zip: form.zip,
        propertyType: form.property_type,
        numUnits: parseInt(form.num_units),
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok && !data.propertyId) {
      setError(data.error || t('errorCreatingProperty', lang))
      setLoading(false)
      return
    }
    draft.clear()
    router.push(`/landlord/properties/${data.propertyId}`)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          {t('backToDashboardArrow', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">
          {isOnboarding ? t('letsAddFirstProperty', lang) : t('addAPropertyHeading', lang)}
        </h1>
        <p className="text-white/50 text-sm mb-8">
          {isOnboarding
            ? t('onboardingPropertyDesc', lang)
            : t('enterPropertyDetails', lang)}
        </p>

        {pmClients.length > 0 && (
          <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-2xl p-4 mb-6">
            <label htmlFor="property-for" className="text-white text-sm font-semibold block mb-1">Adding this property for</label>
            <select
              id="property-for"
              value={forPortfolioId}
              onChange={(e) => setForPortfolioId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">My own portfolio</option>
              {pmClients.map((c) => (
                <option key={c.portfolioId} value={c.portfolioId} className="bg-[#0C1A2E]">{c.ownerName} (client)</option>
              ))}
            </select>
            {forClient && (
              <p className="text-white/50 text-xs mt-2">
                It&apos;ll be owned by {forClient.ownerName} and counted on their plan. They&apos;ll get a notification and see it in their activity feed. Once it&apos;s created, you can add units, tenants and jobs from the property page as usual.
              </p>
            )}
          </div>
        )}

        <ScrollReveal>
        {billingBlocked && !forClient ? (
          <SubscribeToAdd what={t('propertiesWord', lang)} />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <DraftNote
            restored={draft.restored}
            savedAt={draft.savedAt}
            onDiscard={() => {
              draft.clear()
              setForm({ address: '', city: '', state: '', zip: '', property_type: 'residential', num_units: '1' })
              setPlaceGeo(null)
            }}
          />

          <div>
            <label htmlFor="property-address" className="text-white/70 text-sm block mb-1">{t('streetAddressLabel', lang)}</label>
            <AddressAutocomplete
              id="property-address"
              value={form.address}
              onChange={handleAddressChange}
              onPlaceSelected={handlePlaceSelected}
              placeholder={t('startTypingAddress', lang)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <p className="text-white/50 text-xs mt-1">{t('pickSuggestionAutofill', lang)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="property-city" className="text-white/70 text-sm block mb-1">{t('cityLabel', lang)}</label>
              <input
                id="property-city"
                type="text"
                name="city"
                required
                value={form.city}
                onChange={handleChange}
                placeholder="Philadelphia"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label htmlFor="property-state" className="text-white/70 text-sm block mb-1">{t('stateLabel', lang)}</label>
              <input
                id="property-state"
                type="text"
                name="state"
                required
                value={form.state}
                onChange={handleChange}
                placeholder="PA"
                maxLength={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
          </div>

          <div>
            <label htmlFor="property-zip" className="text-white/70 text-sm block mb-1">{t('zipCodeLabel', lang)}</label>
            <input
              id="property-zip"
              type="text"
              name="zip"
              value={form.zip}
              onChange={handleChange}
              placeholder="19103"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label htmlFor="property-type" className="text-white/70 text-sm block mb-1">{t('propertyTypeLabel', lang)}</label>
            <select
              id="property-type"
              name="property_type"
              value={form.property_type}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="residential" className="bg-[#0C1A2E]">{t('residentialOption', lang)}</option>
              <option value="commercial" className="bg-[#0C1A2E]">{t('commercialOption', lang)}</option>
              <option value="mixed" className="bg-[#0C1A2E]">{t('mixedUseOption', lang)}</option>
            </select>
          </div>

          <div>
            <label htmlFor="property-num-units" className="text-white/70 text-sm block mb-1">{t('numberOfUnitsLabel', lang)}</label>
            <input
              id="property-num-units"
              type="number"
              name="num_units"
              required
              min="1"
              max="50"
              value={form.num_units}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <p className="text-white/50 text-xs mt-1">{t('unitsCreatedAutomatically', lang)}</p>
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
            {loading ? t('creatingPropertyDots', lang) : t('addPropertyBtnShort', lang)}
          </RippleButton>

        </form>
        )}
        </ScrollReveal>
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
      {ConfirmDialog}
    </div>
  )
}

export default function NewPropertyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    }>
      <NewPropertyForm />
    </Suspense>
  )
}