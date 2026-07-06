'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Appliance',
  'Structural', 'Pest', 'Turnover', 'Other',
]

const EMERGENCY_EXAMPLES = [
  'Active water leak or flooding',
  'No heat in freezing weather',
  'Gas smell',
  'No working locks / broken entry door',
  'Sewage backup',
  'Exposed or sparking electrical wiring',
]

export default function ReportIssuePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showEmergencyInfo, setShowEmergencyInfo] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  const [form, setForm] = useState({
    category: '',
    urgency: 'normal',
    description: '',
    is_emergency: false,
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)

      const { data: tenancyData, error: tenancyError } = await supabase
        .from('tenancies')
        .select('unit_id')
        .eq('renter_user_id', user.id)
        .eq('ended', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (tenancyError || !tenancyData) {
        setError('No active unit found on your account. Contact your landlord if this seems wrong.')
        setLoading(false)
        return
      }

      setUnitId(tenancyData.unit_id)
      setLoading(false)
    }
    init()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const toggleEmergency = () => {
    if (!form.is_emergency) {
      setShowEmergencyInfo(true)
    } else {
      setForm({ ...form, is_emergency: false })
    }
  }

  const confirmEmergency = () => {
    setForm({ ...form, is_emergency: true })
    setShowEmergencyInfo(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.category) {
      setError('Please select a category.')
      return
    }
    if (!form.description.trim()) {
      setError('Please describe the issue.')
      return
    }
    if (!unitId || !userId) {
      setError('Could not identify your unit. Please try again.')
      return
    }

    setSubmitting(true)
    setError(null)

    const { data: jobData, error: insertError } = await supabase
      .from('jobs')
      .insert({
        unit_id: unitId,
        reported_by: userId,
        category: form.category,
        urgency: form.is_emergency ? 'emergency' : form.urgency,
        description: form.description.trim(),
        is_emergency: form.is_emergency,
        status: 'pending_approval',
      })
      .select()
      .single()

    if (insertError || !jobData) {
      console.error('Error creating job:', insertError)
      setError('Could not submit report. Please try again.')
      setSubmitting(false)
      return
    }

    for (const file of files) {
      const fileExt = file.name.split('.').pop()
      const filePath = `${jobData.id}/${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Error uploading photo:', uploadError)
        continue
      }

      const { error: photoInsertError } = await supabase
        .from('job_photos')
        .insert({
          job_id: jobData.id,
          uploaded_by: userId,
          photo_url: filePath,
        })

      if (photoInsertError) {
        console.error('Error saving photo record:', photoInsertError)
      }
    }

    router.push('/renter')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-2">Report an issue</h1>
        <p className="text-white/50 text-sm mb-8">
          Let your landlord know what's going on. Add photos if you can — it helps get the right contractor.
        </p>

        {unitId && (
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="text-white/70 text-sm block mb-1">Category</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              >
                <option value="" className="bg-[#0C1A2E]">Select a category</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#0C1A2E]">{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                required
                rows={4}
                placeholder="What's going on? Be as specific as you can."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none"
              />
            </div>

            {!form.is_emergency && (
              <div>
                <label className="text-white/70 text-sm block mb-1">Urgency</label>
                <select
                  name="urgency"
                  value={form.urgency}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                >
                  <option value="low" className="bg-[#0C1A2E]">Low</option>
                  <option value="normal" className="bg-[#0C1A2E]">Normal</option>
                  <option value="high" className="bg-[#0C1A2E]">High</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-white/70 text-sm block mb-1">Photos (optional)</label>
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                  {files.length > 0 ? `${files.length} photo(s) selected` : '+ Add photos'}
                </span>
              </label>
            </div>

            <div
              className={
                form.is_emergency
                  ? 'bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start justify-between gap-4'
                  : 'bg-white/3 border border-white/8 rounded-xl p-4 flex items-start justify-between gap-4'
              }
            >
              <div>
                <p className={form.is_emergency ? 'text-red-400 font-semibold text-sm' : 'text-white font-semibold text-sm'}>
                  🚨 This is an emergency
                </p>
                <p className="text-white/40 text-xs mt-1">
                  Only use this for issues that need attention right away — active leaks, gas smells, no heat, broken locks.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleEmergency}
                className={
                  form.is_emergency
                    ? 'shrink-0 bg-red-500/20 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-lg'
                    : 'shrink-0 bg-white/8 text-white/70 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/12 transition'
                }
              >
                {form.is_emergency ? 'Marked' : 'Mark as emergency'}
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit report'}
            </button>
          </form>
        )}

        {!unitId && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}
      </main>

      {showEmergencyInfo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-3">Is this really an emergency?</h3>
            <p className="text-white/50 text-sm mb-3">Emergencies are for things like:</p>
            <ul className="space-y-1.5 mb-5">
              {EMERGENCY_EXAMPLES.map((ex) => (
                <li key={ex} className="text-white/70 text-sm flex items-start gap-2">
                  <span className="text-red-400">•</span> {ex}
                </li>
              ))}
            </ul>
            <p className="text-white/30 text-xs mb-5">
              Marking non-urgent issues as emergencies slows down response times for everyone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEmergencyInfo(false)}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition"
              >
                Not an emergency
              </button>
              <button
                onClick={confirmEmergency}
                className="flex-1 bg-red-500/20 text-red-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-500/30 transition"
              >
                Yes, it's urgent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}