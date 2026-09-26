'use client'

import { useState, useEffect, Suspense } from 'react'
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

function NewPropertyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === '1'
  const billing = useBillingStatus()
  const billingBlocked = BILLING_ENFORCED && billing.needsPayment
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
  // What they said at signup ("2-5", "6-10", etc.) — purely a one-time
  // stated intent, never treated as a live count anywhere (the properties
  // table is always the real source of truth for that). Its only job is
  // deciding whether to offer "add another?" right after this first one,
  // since onboarding itself only ever walks through a single property.
  const [expectedPropertyCount, setExpectedPropertyCount] = useState<string | null>(null)
  const [showAddAnotherPrompt, setShowAddAnotherPrompt] = useState(false)

  const PROPERTY_COUNT_LABEL: Record<string, string> = {
    '2-5': '2–5', '6-10': '6–10', '11-25': '11–25', '26+': '26+',
  }

  // If they gave an address on the signup form (before there was an
  // authenticated session to actually save it), pick it up here instead of
  // asking again — only on first arrival at onboarding, and only if they
  // haven't already started typing something else in the meantime.
  useEffect(() => {
    if (!isOnboarding) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      const meta = user?.user_metadata
      if (meta?.property_count) setExpectedPropertyCount(meta.property_count)
      if (!meta?.onboarding_address) return
      setForm((f) => f.address ? f : {
        ...f,
        address: meta.onboarding_address || '',
        city: meta.onboarding_city || '',
        state: meta.onboarding_state || '',
        zip: meta.onboarding_zip || '',
      })
      if (meta.onboarding_lat != null && meta.onboarding_lng != null) {
        setPlaceGeo({ lat: meta.onboarding_lat, lng: meta.onboarding_lng })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnboarding])

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
      setError('Not authenticated: ' + (userError?.message || 'no user'))
      setLoading(false)
      return
    }

    const { data: session } = await supabase.auth.getSession()
    if (!session.session) {
      setError('No active session found')
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
      setError('You already have a property at this address.')
      setLoading(false)
      return
    }

    if (dup.ownedByOther) {
      const proceed = window.confirm(
        'This address is already registered by another Prophandld account. If you\'re taking over management of this property, that\'s fine to ignore — otherwise, double-check the address before continuing.\n\nAdd it anyway?'
      )
      if (!proceed) {
        setLoading(false)
        return
      }
    }

    // Prefer the precise coordinates from Places autocomplete; fall back to
    // ZIP-based geocoding if the address was typed manually.
    const geo = placeGeo ?? (form.zip ? await geocodeZip(form.zip) : null)

    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .insert({
        owner_user_id: user.id,
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
      setError('Error creating property: ' + propertyError.message + ' | User: ' + user.id)
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
      setError('Error setting property role: ' + roleError.message)
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
        setError('Error creating units: ' + unitsError.message)
        setLoading(false)
        return
      }
    }

    fetch('/api/stripe/subscription/sync', { method: 'POST' }).catch(() => {})

    if (isOnboarding && expectedPropertyCount && PROPERTY_COUNT_LABEL[expectedPropertyCount]) {
      // They said at signup they'd be managing more than one — onboarding
      // itself only ever walks through a single property, so without this
      // they'd just land on the dashboard having only ever added the one.
      // Ask once, right while they're still in the flow of doing it.
      setLoading(false)
      setShowAddAnotherPrompt(true)
      return
    }

    if (isOnboarding) {
      router.push('/landlord')
    } else {
      router.push(`/landlord/properties/${property.id}`)
    }
  }

  const handleAddAnother = () => {
    setShowAddAnotherPrompt(false)
    setExpectedPropertyCount(null) // ask only once, not after every additional property
    setForm({ address: '', city: '', state: '', zip: '', property_type: 'residential', num_units: '1' })
    setPlaceGeo(null)
  }

  if (showAddAnotherPrompt) {
    const label = PROPERTY_COUNT_LABEL[expectedPropertyCount ?? ''] ?? ''
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center px-6">
        <ScrollReveal>
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mx-auto mb-5 motion-safe:animate-[popIn_0.5s_ease-out]">
            <span className="text-2xl">🎉</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">First property added</h1>
          <p className="text-white/50 text-sm mb-8">
            You mentioned managing {label} properties — add another one now, or come back to it anytime from your dashboard.
          </p>
          <div className="space-y-3">
            <RippleButton
              type="button"
              onClick={handleAddAnother}
              className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90"
            >
              Add another property
            </RippleButton>
            <RippleButton
              type="button"
              onClick={() => router.push('/landlord')}
              className="w-full bg-white/5 border border-white/10 text-white/70 font-medium py-3 rounded-xl transition hover:bg-white/10"
            >
              I'll do this later
            </RippleButton>
          </div>
        </div>
        </ScrollReveal>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          ← Back to dashboard
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">
          {isOnboarding ? "Let's add your first property" : 'Add a property'}
        </h1>
        <p className="text-white/50 text-sm mb-8">
          {isOnboarding
            ? "Tell us about the property you manage. We'll set up the units for you."
            : 'Enter your property details below.'}
        </p>

        <ScrollReveal>
        {billingBlocked ? (
          <SubscribeToAdd what="properties" />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-white/70 text-sm block mb-1">Street address</label>
            <AddressAutocomplete
              value={form.address}
              onChange={handleAddressChange}
              onPlaceSelected={handlePlaceSelected}
              placeholder="Start typing your address..."
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <p className="text-white/50 text-xs mt-1">Pick a suggestion to auto-fill city, state, and ZIP</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">City</label>
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
              <label className="text-white/70 text-sm block mb-1">State</label>
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
            <label className="text-white/70 text-sm block mb-1">ZIP code</label>
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
            <label className="text-white/70 text-sm block mb-1">Property type</label>
            <select
              name="property_type"
              value={form.property_type}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="residential" className="bg-[#0C1A2E]">Residential</option>
              <option value="commercial" className="bg-[#0C1A2E]">Commercial</option>
              <option value="mixed" className="bg-[#0C1A2E]">Mixed use</option>
            </select>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Number of units</label>
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
            <p className="text-white/50 text-xs mt-1">Units will be created automatically</p>
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
            {loading ? 'Creating property...' : 'Add property'}
          </RippleButton>

        </form>
        )}
        </ScrollReveal>
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
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