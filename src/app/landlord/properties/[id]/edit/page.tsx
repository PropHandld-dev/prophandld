'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { geocodeZip } from '@/lib/geocode'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { AddressAutocomplete, type AutocompletePlace } from '@/components/AddressAutocomplete'

export default function EditPropertyPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    address: '',
    city: '',
    state: '',
    zip: '',
    property_type: 'residential',
  })
  const [placeGeo, setPlaceGeo] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .eq('owner_user_id', user.id)
        .single()

      if (propertyError || !propertyData) {
        router.push('/landlord/properties')
        return
      }

      setForm({
        address: propertyData.address || '',
        city: propertyData.city || '',
        state: propertyData.state || '',
        zip: propertyData.zip || '',
        property_type: propertyData.property_type || 'residential',
      })
      setLoading(false)
    }
    init()
  }, [propertyId, router])

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
    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated')
      setSaving(false)
      return
    }

    const { data: existing } = await supabase
      .from('properties')
      .select('id')
      .eq('owner_user_id', user.id)
      .eq('address', form.address)
      .eq('city', form.city)
      .eq('state', form.state)
      .neq('id', propertyId)
      .maybeSingle()

    if (existing) {
      setError('You already have another property with this address, city, and state.')
      setSaving(false)
      return
    }

    // Prefer the precise coordinates from Places autocomplete if the address
    // was re-picked; otherwise re-geocode in case the ZIP changed
    const geo = placeGeo ?? (form.zip ? await geocodeZip(form.zip) : null)

    const { error: updateError } = await supabase
      .from('properties')
      .update({
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        property_type: form.property_type,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      })
      .eq('id', propertyId)

    if (updateError) {
      setError('Error updating property: ' + updateError.message)
      setSaving(false)
      return
    }

    router.push(`/landlord/properties/${propertyId}`)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Back to property
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-24" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64 mb-6" />
            <Skeleton className="h-14" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
        <>
        <h1 className="text-2xl font-bold text-white mb-2">Edit property</h1>
        <p className="text-white/50 text-sm mb-8">Update your property details below.</p>

        <ScrollReveal>
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-white/70 text-sm block mb-1">Street address</label>
            <AddressAutocomplete
              value={form.address}
              onChange={handleAddressChange}
              onPlaceSelected={handlePlaceSelected}
              placeholder="Start typing your address..."
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
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
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
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
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
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

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <RippleButton
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </RippleButton>

        </form>
        </ScrollReveal>
        </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}