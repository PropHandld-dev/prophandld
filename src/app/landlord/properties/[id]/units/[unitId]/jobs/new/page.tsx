'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { AlertTriangleIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'

const CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Appliance',
  'Structural', 'Pest', 'Turnover', 'Other',
]

export default function NewLandlordJobPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string
  // Set when this job is posted from a DM with a contractor (the "start a
  // job" rehire flow) — after creating the job, that contractor gets a
  // direct nudge (chat message + email) to bid, on top of the job staying
  // open to everyone else the normal way.
  const nudgeThreadId = searchParams.get('nudgeThread')

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
      setFiles([...files, ...Array.from(e.target.files)])
    }
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
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

    if (nudgeThreadId) {
      await supabase.from('messages').insert({
        thread_id: nudgeThreadId,
        sender_user_id: user.id,
        body: `📋 New job posted: ${jobData.category} — take a look and submit a bid if you're available.`,
      })
      fetch('/api/dm-job-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: nudgeThreadId, jobId: jobData.id }),
      }).catch((err) => console.error('Failed to send job invite email:', err))
      router.push(`/landlord/messages/${nudgeThreadId}`)
      return
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
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-24" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">Create a job</h1>
        <p className="text-white/50 text-sm mb-8">
          Start a maintenance job directly — no approval needed since you're the landlord.
        </p>

        {nudgeThreadId && (
          <div className="bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-xl px-4 py-3 mb-6">
            <p className="text-[#12A5A9] text-sm">
              This job will be posted openly, and the contractor you were messaging will be notified directly to bid on it first.
            </p>
          </div>
        )}

        <ScrollReveal>
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
                {files.length > 0 ? `+ Add more photos` : '+ Add photos'}
              </span>
            </label>
            {files.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {files.map((file, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Selected ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/80 transition-all"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-all">
            <input
              type="checkbox"
              checked={form.is_emergency}
              onChange={(e) => setForm({ ...form, is_emergency: e.target.checked })}
              className="w-4 h-4"
            />
            <AlertTriangleIcon className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="text-white text-sm">Mark as emergency</span>
          </label>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <RippleButton
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create job'}
          </RippleButton>
        </form>
        </ScrollReveal>
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
