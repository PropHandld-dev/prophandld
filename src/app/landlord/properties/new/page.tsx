'use client'

import { useState, Suspense } from 'react'
import { SubscribeToAdd } from '@/components/BillingReminder'
import { useBillingStatus, BILLING_ENFORCED } from '@/lib/useBillingStatus'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { geocodeZip } from '@/lib/geocode'
import { BottomTabBar } from '@/components/BottomTabBar'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { AddressAutocomplete, type AutocompletePlace } from '@/components/AddressAutocomplete'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { useLanguage, t } from '@/lib/i18n'
import { useConfirm } from '@/lib/useConfirm'

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

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      setError(t('notAuthenticatedColon', lang))
      setLoading(false)
      return
    }

    const { data: session } = await supabase.auth.getSession()
    if (!session.session) {
      setError(t('noActiveSessionFound', lang))
      setLoading(false)
      return
    }

    // Checked server-side (not just against this landlord's own rows) since
    // a client can only ever see its own properties under RLS — catching
    // the same address already registered under a *different* landlord
    // needs a service-role check. See check-duplicate-address/route.ts.
    const dupRes = await fetch('/api/landlord/properties/check-duplicate-address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: form.address, city: form.city, state: form.state }),
    })
    const dup = await dupRes.json().catch(() => ({}))

    if (dup.ownedByMe) {
      setError(t('alreadyHavePropertyAddress', lang))
      setLoading(false)
      return
    }

    if (dup.ownedByOther) {
      const proceed = await confirm({ body: t('addressRegisteredOther', lang) })
      if (!proceed) {
        setLoading(false)
        return
      }
    }

    // Prefer the precise coordinates from Places autocomplete; fall back to
    // ZIP-based geocoding if the address was typed manually.
    const geo = placeGeo ?? (form.zip ? await geocodeZip(form.zip) : null)

    // A co-owner creating a property attributes it to the PRIMARY they
    // co-manage for, not themselves — the portfolio stays single-owned
    // for billing/payout purposes. Falls back to the signed-in user's own
    // id for an ordinary landlord (the common case).
    const { data: effectiveOwnerId } = await supabase.rpc('primary_landlord_id')

    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .insert({
        owner_user_id: effectiveOwnerId ?? user.id,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        property_type: form.property_type,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      })
      .select('id')
      .single()

    if (propertyError) {
      console.error('Error creating property:', propertyError, 'user:', user.id)
      setError(t('errorCreatingProperty', lang))
      setLoading(false)
      return
    }

    const { error: roleError } = await supabase
      .from('property_roles')
      .insert({
        user_id: user.id,
        property_id: property.id,
        role: 'landlord',
        granted_by: user.id,
      })

    if (roleError) {
      console.error('Error setting property role:', roleError)
      setError(t('errorSettingPropertyRole', lang))
      setLoading(false)
      return
    }

    const numUnits = parseInt(form.num_units)
    if (numUnits > 0) {
      const units = Array.from({ length: numUnits }, (_, i) => ({
        property_id: property.id,
        unit_number: numUnits === 1 ? 'Main' : `Unit ${i + 1}`,
      }))

      const { error: unitsError } = await supabase
        .from('units')
        .insert(units)

      if (unitsError) {
        console.error('Error creating units:', unitsError)
        setError(t('errorCreatingUnits', lang))
        setLoading(false)
        return
      }
    }

    fetch('/api/stripe/subscription/sync', { method: 'POST' }).catch(() => {})

    if (isOnboarding) {
      router.push('/landlord')
    } else {
      router.push(`/landlord/properties/${property.id}`)
    }
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

        <ScrollReveal>
        {billingBlocked ? (
          <SubscribeToAdd what={t('propertiesWord', lang)} />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('streetAddressLabel', lang)}</label>
            <AddressAutocomplete
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
              <label className="text-white/70 text-sm block mb-1">{t('cityLabel', lang)}</label>
              <input
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
              <label className="text-white/70 text-sm block mb-1">{t('stateLabel', lang)}</label>
              <input
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
            <label className="text-white/70 text-sm block mb-1">{t('zipCodeLabel', lang)}</label>
            <input
              type="text"
              name="zip"
              value={form.zip}
              onChange={handleChange}
              placeholder="19103"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('propertyTypeLabel', lang)}</label>
            <select
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
            <label className="text-white/70 text-sm block mb-1">{t('numberOfUnitsLabel', lang)}</label>
            <input
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