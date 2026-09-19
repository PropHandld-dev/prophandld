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
import { normalizeAddress } from '@/lib/address'

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
  const [archived, setArchived] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .eq('owner_user_id', user.id)
        .single()

      if (propertyError || !propertyData) {
        router.replace('/landlord/properties')
        return
      }

      setForm({
        address: propertyData.address || '',
        city: propertyData.city || '',
        state: propertyData.state || '',
        zip: propertyData.zip || '',
        property_type: propertyData.property_type || 'residential',
      })
      setArchived(!!propertyData.archived)
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

    const { data: ownedProperties } = await supabase
      .from('properties')
      .select('id, address, city, state')
      .eq('owner_user_id', user.id)
      .neq('id', propertyId)

    const normalizedNew = normalizeAddress(form.address)
    const normalizedCity = form.city.trim().toLowerCase()
    const normalizedState = form.state.trim().toLowerCase()
    const duplicate = (ownedProperties || []).find(
      (p) =>
        normalizeAddress(p.address || '') === normalizedNew &&
        (p.city || '').trim().toLowerCase() === normalizedCity &&
        (p.state || '').trim().toLowerCase() === normalizedState
    )

    if (duplicate) {
      setError('You already have another property with this address.')
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

  const handleArchiveToggle = async () => {
    const confirmed = archived
      ? window.confirm('Unarchive this property? It\'ll show up in your active portfolio again.')
      : window.confirm('Archive this property? It\'ll be hidden from your active portfolio, but nothing is deleted — you can unarchive it anytime from Properties → Show archived.')
    if (!confirmed) return

    setArchiving(true)
    const { error: archiveError } = await supabase
      .from('properties')
      .update({ archived: !archived })
      .eq('id', propertyId)

    if (archiveError) {
      setError('Could not update archive status: ' + archiveError.message)
      setArchiving(false)
      return
    }

    router.push('/landlord/properties')
  }

  const handleDelete = async () => {
    if (deleteConfirmText.trim().toLowerCase() !== form.address.trim().toLowerCase()) return

    setDeleting(true)
    setError(null)
    const res = await fetch(`/api/landlord/properties/${propertyId}/delete`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError('Could not delete property' + (data.error ? ': ' + data.error : '.'))
      setDeleting(false)
      return
    }

    router.push('/landlord/properties')
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
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
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

        <div className="mt-10 pt-8 border-t border-white/8">
          <h2 className="text-white font-semibold mb-1">{archived ? 'Archived' : 'Archive this property'}</h2>
          <p className="text-white/60 text-sm mb-4">
            {archived
              ? "This property is archived and hidden from your active portfolio. Nothing's been deleted."
              : "Hide this property from your active portfolio without deleting anything — handy once you've sold it or stopped managing it. You can unarchive it anytime."}
          </p>
          <button
            onClick={handleArchiveToggle}
            disabled={archiving}
            className="bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/8 font-semibold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50"
          >
            {archiving ? 'Working…' : archived ? 'Unarchive property' : 'Archive property'}
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-red-500/20">
          <h2 className="text-red-400 font-semibold mb-1">Delete this property</h2>
          <p className="text-white/60 text-sm mb-4">
            Permanently deletes this property and everything under it — units, tenancies, rent history, jobs, bids, documents, and compliance records. This cannot be undone. Archiving above is the safer, reversible option.
          </p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-semibold px-5 py-2.5 rounded-xl text-sm transition"
            >
              Delete property
            </button>
          ) : (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-3">
              <p className="text-white/70 text-sm">
                Type the property&apos;s address (<span className="text-white font-medium">{form.address}</span>) to confirm.
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={form.address}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/50 focus:outline-none focus:border-red-400 transition text-sm"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmText.trim().toLowerCase() !== form.address.trim().toLowerCase()}
                  className="bg-red-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition hover:opacity-90 disabled:opacity-40"
                >
                  {deleting ? 'Deleting…' : 'Permanently delete'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                  disabled={deleting}
                  className="text-white/50 hover:text-white text-sm transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}