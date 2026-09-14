'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { LANDLORD_TABS } from '@/lib/navTabs'

export default function NewTenancyPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    renter_email: '',
    rent_amount: '',
    lease_start: '',
    lease_end: '',
    security_deposit: '',
    escalation_percent: '',
    escalation_frequency_months: '',
    occupants: '',
    pets: '',
    lease_notes: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Find renter by email using secure function
    const { data: renterId, error: renterError } = await supabase
      .rpc('get_user_id_by_email', { email_input: form.renter_email })

    if (renterError || !renterId) {
      setError('No renter found with that email. They must sign up as a Renter first.')
      setLoading(false)
      return
    }

    // Create tenancy
    const { error: tenancyError } = await supabase
      .from('tenancies')
      .insert({
        unit_id: unitId,
        renter_user_id: renterId,
        rent_amount: form.rent_amount ? parseFloat(form.rent_amount) : null,
        lease_start: form.lease_start || null,
        lease_end: form.lease_end || null,
        security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : null,
        escalation_percent: form.escalation_percent ? parseFloat(form.escalation_percent) : null,
        escalation_frequency_months: form.escalation_frequency_months ? parseInt(form.escalation_frequency_months) : null,
        occupants: form.occupants ? parseInt(form.occupants) : null,
        pets: form.pets.trim() || null,
        lease_notes: form.lease_notes.trim() || null,
      })

    if (tenancyError) {
      setError('Error creating tenancy: ' + tenancyError.message)
      setLoading(false)
      return
    }

    router.push(`/landlord/properties/${propertyId}/units/${unitId}/inspection`)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}/units/${unitId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Back to unit
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">Link a renter</h1>
        <p className="text-white/50 text-sm mb-8">
          The renter must already have a Prophandld account. Enter their email to link them to this unit.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-white/70 text-sm block mb-1">Renter email</label>
            <input
              type="email"
              name="renter_email"
              required
              value={form.renter_email}
              onChange={handleChange}
              placeholder="renter@email.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <p className="text-white/30 text-xs mt-1">They must be signed up as a Renter on Prophandld</p>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Monthly rent ($)</label>
            <input
              type="number"
              name="rent_amount"
              value={form.rent_amount}
              onChange={handleChange}
              placeholder="1500"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Security deposit ($)</label>
            <input
              type="number"
              name="security_deposit"
              value={form.security_deposit}
              onChange={handleChange}
              placeholder="1500"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Lease start</label>
              <input
                type="date"
                name="lease_start"
                value={form.lease_start}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Lease end</label>
              <input
                type="date"
                name="lease_end"
                value={form.lease_end}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Rent escalation (%)</label>
              <input
                type="number"
                step="0.1"
                name="escalation_percent"
                value={form.escalation_percent}
                onChange={handleChange}
                placeholder="4"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Every (months)</label>
              <input
                type="number"
                name="escalation_frequency_months"
                value={form.escalation_frequency_months}
                onChange={handleChange}
                placeholder="12"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Occupants</label>
            <input
              type="number"
              name="occupants"
              value={form.occupants}
              onChange={handleChange}
              placeholder="2"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Pets</label>
            <input
              type="text"
              name="pets"
              value={form.pets}
              onChange={handleChange}
              placeholder="e.g. 1 dog (Labrador)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Lease notes</label>
            <textarea
              name="lease_notes"
              value={form.lease_notes}
              onChange={handleChange}
              rows={3}
              placeholder="Anything else worth noting about this lease"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none"
            />
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
            {loading ? 'Linking renter...' : 'Link renter to unit'}
          </button>

        </form>
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}