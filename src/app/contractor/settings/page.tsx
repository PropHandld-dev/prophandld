'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Appliance',
  'Structural', 'Pest', 'Turnover', 'Other',
]

export default function ContractorSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [zip, setZip] = useState('')
  const [licensed, setLicensed] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('users')
        .select('service_categories, service_zip, licensed')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData) {
        setSelectedCategories(profileData.service_categories || [])
        setZip(profileData.service_zip || '')
        setLicensed(profileData.licensed || false)
      }
      setLoading(false)
    }
    init()
  }, [router])

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    if (selectedCategories.length === 0) {
      setError('Select at least one category you service.')
      setSaving(false)
      return
    }
    if (!zip.trim()) {
      setError('Enter the ZIP code you service.')
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated.')
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        service_categories: selectedCategories,
        service_zip: zip.trim(),
        licensed,
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error saving contractor profile:', updateError)
      setError('Could not save your profile.')
      setSaving(false)
      return
    }

    setSuccess('Profile saved. You\'ll now see matching jobs on your dashboard.')
    setSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-24" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-2">Service settings</h1>
        <p className="text-white/50 text-sm mb-8">
          Tell us what you do and where, so we can match you to the right jobs.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-white/70 text-sm block mb-2">Categories you service</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  className={
                    selectedCategories.includes(cat)
                      ? 'flex items-center gap-2 bg-[#0A7B7E]/15 border border-[#12A5A9]/40 rounded-xl px-3 py-2.5 cursor-pointer'
                      : 'flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-white/8 transition'
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="w-4 h-4"
                  />
                  <span className="text-white text-sm">{cat}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">ZIP code you service</label>
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="19136"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <p className="text-white/30 text-xs mt-1">
              For now, jobs match on exact ZIP. Wider radius matching is coming soon.
            </p>
          </div>

          <label className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={licensed}
              onChange={(e) => setLicensed(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-white text-sm">I am a licensed contractor</span>
          </label>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 text-[#12A5A9] text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </form>
      </main>
    </div>
  )
}
