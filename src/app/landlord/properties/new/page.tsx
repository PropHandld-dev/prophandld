'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewPropertyPage() {
  const router = useRouter()
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Insert property
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .insert({
        owner_user_id: user.id,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        property_type: form.property_type,
      })
      .select()
      .single()

    if (propertyError) {
      setError('Error creating property: ' + propertyError.message)
      setLoading(false)
      return
    }

    // Store role in property_roles
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

    // Create units based on num_units
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

    router.push(`/landlord/properties/${property.id}`)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          ← Back to dashboard
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-2">Add a property</h1>
        <p className="text-white/50 text-sm mb-8">Enter your property details below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-white/70 text-sm block mb-1">Street address</label>
            <input
              type="text"
              name="address"
              required
              value={form.address}
              onChange={handleChange}
              placeholder="123 Main St"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <p className="text-white/30 text-xs mt-1">Units will be created automatically</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Creating property...' : 'Add property'}
          </button>

        </form>
      </main>
    </div>
  )
}