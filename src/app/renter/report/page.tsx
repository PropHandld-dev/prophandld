'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { notify } from '@/lib/notify'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { AlertTriangleIcon } from '@/components/icons'
import { RENTER_TABS } from '@/lib/navTabs'
import { useCategoryOptions, saveCustomCategory } from '@/lib/categories'

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
  const [systems, setSystems] = useState<any[]>([])

  const [form, setForm] = useState({
    category: '',
    categoryOther: '',
    urgency: 'normal',
    description: '',
    is_emergency: false,
    maintenance_item_id: '',
  })
  const [categoryOptions] = useCategoryOptions()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
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

      const { data: systemsData } = await supabase
        .from('maintenance_items')
        .select('id, name, item_type')
        .eq('unit_id', tenancyData.unit_id)

      setSystems(systemsData || [])
      setLoading(false)
    }
    init()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement>) => {
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
    if (form.category === 'Other' && !form.categoryOther.trim()) {
      setError('Please tell us what kind of issue this is.')
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

    const finalCategory = form.category === 'Other'
      ? await saveCustomCategory(form.categoryOther, userId)
      : form.category

    const { data: jobData, error: insertError } = await supabase
      .from('jobs')
      .insert({
        unit_id: unitId,
        reported_by: userId,
        category: finalCategory,
        urgency: form.is_emergency ? 'emergency' : form.urgency,
        description: form.description.trim(),
        is_emergency: form.is_emergency,
        status: 'pending_approval',
        maintenance_item_id: form.maintenance_item_id || null,
      })
      .select()
      .single()

    if (insertError || !jobData) {
      console.error('Error creating job:', insertError)
      setError('Could not submit report. Please try again.')
      setSubmitting(false)
      return
    }

    notify('job_reported', jobData.id)

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
          stage: 'general',
        })

      if (photoInsertError) {
        console.error('Error saving photo record:', photoInsertError)
      }
    }

    router.push('/renter')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>
      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <Skeleton className="h-7 w-48 mb-2" />
        <Skeleton className="h-4 w-72 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-28" />
          <Skeleton className="h-14" />
          <Skeleton className="h-24" />
        </div>
      </main>
      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">Report an issue</h1>
        <p className="text-white/50 text-sm mb-8">
          Let your landlord know what's going on. Add photos if you can — it helps get the right contractor.
        </p>

        {unitId && (
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
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#0C1A2E]">{cat}</option>
                ))}
                <option value="Other" className="bg-[#0C1A2E]">Other</option>
              </select>
            </div>

            {form.category === 'Other' && (
              <div>
                <label className="text-white/70 text-sm block mb-1">What kind of issue is it?</label>
                <input
                  type="text"
                  name="categoryOther"
                  value={form.categoryOther}
                  onChange={handleChange}
                  placeholder="e.g. Landscaping, Mold, Locksmith"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
            )}

            {form.category && systems.filter((s) => s.item_type?.toLowerCase() === form.category.toLowerCase()).length > 0 && (
              <div>
                <label className="text-white/70 text-sm block mb-1">Related system (optional)</label>
                <select
                  name="maintenance_item_id"
                  value={form.maintenance_item_id}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                >
                  <option value="" className="bg-[#0C1A2E]">Not sure / none</option>
                  {systems
                    .filter((s) => s.item_type?.toLowerCase() === form.category.toLowerCase())
                    .map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#0C1A2E]">{s.name}</option>
                    ))}
                </select>
              </div>
            )}

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
              <label className="block mb-3">
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
                <div className="grid grid-cols-4 gap-2">
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
                        className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/80 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleEmergency}
              className={
                form.is_emergency
                  ? 'w-full text-left bg-red-500/10 border-2 border-red-500/40 rounded-xl p-4 flex items-center justify-between gap-4 transition'
                  : 'w-full text-left bg-white/3 border-2 border-red-500/25 hover:border-red-500/40 hover:bg-red-500/5 rounded-xl p-4 flex items-center justify-between gap-4 transition'
              }
            >
              <div>
                <p className={form.is_emergency ? 'text-red-400 font-semibold text-sm flex items-center gap-1.5' : 'text-white font-semibold text-sm flex items-center gap-1.5'}>
                  <AlertTriangleIcon className="w-4 h-4" /> This is an emergency
                </p>
                <p className="text-white/40 text-xs mt-1">
                  Only use this for issues that need attention right away — active leaks, gas smells, no heat, broken locks.
                </p>
              </div>
              <span
                className={
                  form.is_emergency
                    ? 'shrink-0 bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-lg'
                    : 'shrink-0 bg-red-500/15 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg'
                }
              >
                {form.is_emergency ? 'Marked ✓' : 'Mark as emergency'}
              </span>
            </button>

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
              {submitting ? 'Submitting...' : 'Submit report'}
            </RippleButton>
          </form>
          </ScrollReveal>
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

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}