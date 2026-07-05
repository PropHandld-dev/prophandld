'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function NewUnitPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    unit_number: '',
    floor: '',
    sqft: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated')
      setLoading(false)
      return
    }

    // Check for duplicate unit_number on this property
    const { data: existing } = await supabase
      .from('units')
      .select('id')
      .eq('property_id', propertyId)
      .eq('unit_number', form.unit_number.trim())
      .maybeSingle()

    if (existing) {
      setError('A unit with this number already exists on this property.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase
      .from('units')
      .insert({
        property_id: propertyId,
        unit_number: form.unit_number.trim(),
        floor: form.floor ? parseInt(form.floor) : null,
        sqft: form.sqft ? parseInt(form.sqft) : null,
      })

    if (insertError) {
      setError('Error creating unit: ' + insertError.message)
      setLoading(false)
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

      <main className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-2">Add a unit</h1>
        <p className="text-white/50 text-sm mb-8">Enter the new unit's details below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-white/70 text-sm block mb-1">Unit number</label>
            <input
              type="text"
              name="unit_number"
              required
              value={form.unit_number}
              onChange={handleChange}
              placeholder="Unit 3"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Floor (optional)</label>
              <input
                type="number"
                name="floor"
                value={form.floor}
                onChange={handleChange}
                placeholder="2"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Sqft (optional)</label>
              <input
                type="number"
                name="sqft"
                value={form.sqft}
                onChange={handleChange}
                placeholder="850"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
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
            {loading ? 'Creating unit...' : 'Add unit'}
          </button>

        </form>
      </main>
    </div>
  )
}
