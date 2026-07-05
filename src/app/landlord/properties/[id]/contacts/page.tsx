'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function PropertyContactsPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [property, setProperty] = useState<any>(null)
  const [units, setUnits] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    role: '',
    phone: '',
    email: '',
    unit_id: '',
  })

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
      setProperty(propertyData)

      const { data: unitsData } = await supabase
        .from('units')
        .select('*')
        .eq('property_id', propertyId)
        .order('unit_number')

      if (unitsData) setUnits(unitsData)

      await loadContacts()
      setLoading(false)
    }
    init()
  }, [propertyId, router])

  const loadContacts = async () => {
    const { data: contactsData, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })

    if (contactsError) {
      console.error('Error loading contacts:', contactsError)
      return
    }
    setContacts(contactsData || [])
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error: insertError } = await supabase
      .from('contacts')
      .insert({
        property_id: propertyId,
        unit_id: form.unit_id || null,
        name: form.name,
        role: form.role || null,
        phone: form.phone || null,
        email: form.email || null,
      })

    if (insertError) {
      console.error('Error adding contact:', insertError)
      setError('Could not add contact. Please try again.')
      setSaving(false)
      return
    }

    setForm({ name: '', role: '', phone: '', email: '', unit_id: '' })
    await loadContacts()
    setSaving(false)
  }

  const handleDelete = async (contactId: string) => {
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)

    if (deleteError) {
      console.error('Error deleting contact:', deleteError)
      setError('Could not delete contact.')
      return
    }

    await loadContacts()
  }

  const getUnitLabel = (unitId: string | null) => {
    if (!unitId) return 'All units (property default)'
    const unit = units.find((u) => u.id === unitId)
    return unit ? unit.unit_number : 'Unknown unit'
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  if (!property) return null

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Property
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Emergency contacts</h1>
          <p className="text-white/50 text-sm mt-1">{property.address}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold mb-2">Add a contact</h2>

          <div>
            <label className="text-white/70 text-sm block mb-1">Name</label>
            <input
              type="text"
              name="name"
              required
              value={form.name}
              onChange={handleChange}
              placeholder="Joe's Plumbing"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Role / relation</label>
            <input
              type="text"
              name="role"
              value={form.role}
              onChange={handleChange}
              placeholder="Plumber, Gas company, Building manager..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Phone</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="(555) 123-4567"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="contact@email.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Applies to</label>
            <select
              name="unit_id"
              value={form.unit_id}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">All units (property default)</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id} className="bg-[#0C1A2E]">
                  {unit.unit_number} only
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add contact'}
          </button>
        </form>

        <h2 className="text-white font-semibold mb-4">
          All contacts {contacts.length > 0 && `(${contacts.length})`}
        </h2>

        {contacts.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No emergency contacts added yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div key={contact.id} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-semibold">{contact.name}</h3>
                    {contact.role && <p className="text-white/50 text-sm mt-0.5">{contact.role}</p>}
                    {contact.phone && <p className="text-white/40 text-sm mt-1">📞 {contact.phone}</p>}
                    {contact.email && <p className="text-white/40 text-sm">✉️ {contact.email}</p>}
                    <span className="inline-block text-xs bg-white/8 text-white/50 rounded-full px-2 py-0.5 mt-2">
                      {getUnitLabel(contact.unit_id)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(contact.id)}
                    className="text-red-400/70 text-xs hover:text-red-400 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
