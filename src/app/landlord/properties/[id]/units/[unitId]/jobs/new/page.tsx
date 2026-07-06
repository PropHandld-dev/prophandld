'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

const CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Appliance',
  'Structural', 'Pest', 'Turnover', 'Other',
]

export default function NewLandlordJobPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])

  const [form, setForm] = useState({
    category: '',
    urgency: 'normal',
    description: '',
    is_emergency: false,
  })

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
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

    setSubmitting(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated.')
      setSubmitting(false)
      return
    }

    // Landlord-created jobs skip approval — they're already self-approved
    const { data: jobData, error: insertError } = await supabase
      .from('jobs')
      .insert({
        unit_id: unitId,
        reported_by: user.id,
        category: form.category,
        urgency: form.is_emergency ? 'emergency' : form.urgency,
        description: form.description.trim(),
        is_emergency: form.is_emergency,
        status: 'approved',
      })
      .select()
      .single()

    if (insertError || !jobData) {
      console.error('Error creating job:', insertError)
      setError('Could not create job. Please try again.')
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

      await supabase.from('job_photos').insert({
        job_id: jobData.id,
        uploaded_by: user.id,
        photo_url: filePath,
      })
    }

    router.push(`/landlord/properties/${propertyId}/units/${unitId}`)
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
        <div className="w-24" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-2">Create a job</h1>
        <p className="text-white/50 text-sm mb-8">
          Start a maintenance job directly — no approval needed since you're the landlord.
        </p>

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
              placeholder="What needs to be done?"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none"
            />
          </div>

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

          <div>
            <label className="text-white/70 text-sm block mb-1">Photos (optional)</label>
            <label className="block">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                {files.length > 0 ? `${files.length} photo(s) selected` : '+ Add photos'}
              </span>
            </label>
          </div>

          <label className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_emergency}
              onChange={(e) => setForm({ ...form, is_emergency: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-white text-sm">Mark as emergency</span>
          </label>

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
            {submitting ? 'Creating...' : 'Create job'}
          </button>
        </form>
      </main>
    </div>
  )
}
