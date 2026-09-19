'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { LANDLORD_TABS } from '@/lib/navTabs'

export default function NewTenancyPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [form, setForm] = useState({
    renter_email: '',
    rent_amount: '',
    rent_due_day: '1',
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
      await sendInvite()
      return
    }

    // Create tenancy
    const { error: tenancyError } = await supabase
      .from('tenancies')
      .insert({
        unit_id: unitId,
        renter_user_id: renterId,
        rent_amount: form.rent_amount ? parseFloat(form.rent_amount) : null,
        rent_due_day: form.rent_due_day ? parseInt(form.rent_due_day) : 1,
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

  const sendInvite = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated.')
      setLoading(false)
      return
    }

    // Replace any existing pending invite for this unit rather than duplicating
    await supabase
      .from('tenancy_invites')
      .update({ status: 'cancelled' })
      .eq('unit_id', unitId)
      .eq('status', 'pending')

    const { data: invite, error: inviteError } = await supabase
      .from('tenancy_invites')
      .insert({
        unit_id: unitId,
        landlord_user_id: user.id,
        renter_email: form.renter_email.trim(),
        rent_amount: form.rent_amount ? parseFloat(form.rent_amount) : null,
        rent_due_day: form.rent_due_day ? parseInt(form.rent_due_day) : 1,
        lease_start: form.lease_start || null,
        lease_end: form.lease_end || null,
        security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : null,
        escalation_percent: form.escalation_percent ? parseFloat(form.escalation_percent) : null,
        escalation_frequency_months: form.escalation_frequency_months ? parseInt(form.escalation_frequency_months) : null,
        occupants: form.occupants ? parseInt(form.occupants) : null,
        pets: form.pets.trim() || null,
        lease_notes: form.lease_notes.trim() || null,
      })
      .select('id')
      .single()

    if (inviteError || !invite) {
      console.error('Error creating invite:', inviteError)
      setError('Could not send invite. Please try again.')
      setLoading(false)
      return
    }

    fetch('/api/invite-renter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId: invite.id }),
    }).catch((err) => console.error('invite-renter fetch failed:', err))

    setInviteSent(true)
    setLoading(false)
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
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">Link a renter</h1>
        <p className="text-white/50 text-sm mb-8">
          Enter their email to link them to this unit. If they don't have a Prophandld account yet, we'll invite them. They'll be linked automatically once they sign up.
        </p>

        {inviteSent ? (
          <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-2xl p-6 text-center">
            <p className="text-[#12A5A9] font-medium">Invite sent to {form.renter_email}</p>
            <p className="text-white/50 text-sm mt-2">
              They'll be linked to this unit automatically once they sign up as a renter.
            </p>
            <Link
              href={`/landlord/properties/${propertyId}/units/${unitId}`}
              className="text-[#12A5A9] text-sm hover:underline block mt-4"
            >
              ← Back to unit
            </Link>
          </div>
        ) : (
        <ScrollReveal>
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Monthly rent ($)</label>
            <input
              type="number"
              name="rent_amount"
              value={form.rent_amount}
              onChange={handleChange}
              placeholder="1500"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Rent due day of month</label>
            <input
              type="number"
              name="rent_due_day"
              min={1}
              max={28}
              value={form.rent_due_day}
              onChange={handleChange}
              placeholder="1"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <p className="text-white/40 text-xs mt-1">Pick 1–28 so it lands on every month, including February.</p>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Security deposit ($)</label>
            <input
              type="number"
              name="security_deposit"
              value={form.security_deposit}
              onChange={handleChange}
              placeholder="1500"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
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
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
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
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none"
            />
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
            {loading ? 'Saving...' : 'Link or invite renter'}
          </RippleButton>

        </form>
        </ScrollReveal>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}