'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/imageCompress'
import { validateMediaFile, isVideoFile } from '@/lib/mediaValidation'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { AlertTriangleIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { useGroupedCategoryOptions } from '@/lib/categories'
import { LOCATION_OPTIONS } from '@/lib/jobLocations'
import { useLanguage, t } from '@/lib/i18n'
import { saveDraft, loadDraft, clearDraft } from '@/lib/formDraft'

type DraftForm = { category: string; location: string; urgency: string; description: string; is_emergency: boolean }

export default function NewLandlordJobPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const lang = useLanguage()
  const propertyId = params.id as string
  const unitId = params.unitId as string
  // Set when this job is posted from a DM with a contractor (the "start a
  // job" rehire flow) — after creating the job, that contractor gets a
  // direct nudge (chat message + email) to bid, on top of the job staying
  // open to everyone else the normal way.
  const nudgeThreadId = searchParams.get('nudgeThread')
  const draftKey = `job-draft:${unitId}`

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [readyCheck, setReadyCheck] = useState<{ checked: boolean; suggestion: string | null }>({ checked: false, suggestion: null })
  const [checkingReady, setCheckingReady] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  const [form, setForm] = useState<DraftForm>({
    category: '',
    location: '',
    urgency: 'normal',
    description: '',
    is_emergency: false,
  })
  const categoryGroups = useGroupedCategoryOptions()

  // Caught live by an external audit (DRAFT-01/JOB-05): a refresh or a Back
  // navigation silently wiped a half-typed report with no warning and no
  // way back. Attachments aren't restorable this way (a File can't be
  // serialized into storage), so this covers the part that actually got
  // lost in the audit's reproduction — category, location, urgency and the
  // description text.
  useEffect(() => {
    const draft = loadDraft<DraftForm>(draftKey)
    if (draft && (draft.category || draft.description.trim())) {
      setForm(draft)
      setDraftRestored(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (form.category || form.description.trim()) saveDraft(draftKey, form)
    else clearDraft(draftKey)
  }, [form, draftKey])

  const discardDraft = () => {
    clearDraft(draftKey)
    setForm({ category: '', location: '', urgency: 'normal', description: '', is_emergency: false })
    setDraftRestored(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement>) => {
    if (readyCheck.checked) setReadyCheck({ checked: false, suggestion: null })
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    if (input.files) {
      const incoming = Array.from(input.files)
      for (const file of incoming) {
        const problem = await validateMediaFile(file)
        if (problem) {
          setError(problem)
          input.value = ''
          return
        }
      }
      setError(null)
      setFiles([...files, ...incoming])
    }
    input.value = ''
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.category) {
      setError(t('pleaseSelectACategory', lang))
      return
    }
    if (!form.description.trim()) {
      setError(t('pleaseDescribeTheIssue', lang))
      return
    }

    // One check per edit — see handleChange, which resets `checked` the
    // moment the category or description actually changes. "Post anyway"
    // on the suggestion card below sets checked:true itself so this
    // doesn't loop a second time on the same content.
    if (!readyCheck.checked) {
      setCheckingReady(true)
      try {
        const res = await fetch('/api/ai-assist/job-ready-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: form.category, description: form.description, hasPhoto: files.length > 0 }),
        })
        const data = await res.json()
        setCheckingReady(false)
        if (!data.ready && data.suggestion) {
          setReadyCheck({ checked: true, suggestion: data.suggestion })
          return
        }
        setReadyCheck({ checked: true, suggestion: null })
      } catch {
        setCheckingReady(false)
        setReadyCheck({ checked: true, suggestion: null })
      }
    }

    setSubmitting(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError(t('notAuthenticatedPeriod', lang))
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
        location: form.location || null,
        urgency: form.is_emergency ? 'emergency' : form.urgency,
        description: form.description.trim(),
        is_emergency: form.is_emergency,
        status: 'approved',
      })
      .select()
      .single()

    if (insertError || !jobData) {
      console.error('Error creating job:', insertError)
      setError(t('couldNotCreateJob', lang))
      setSubmitting(false)
      return
    }

    for (const original of files) {
      const file = await compressImage(original)
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

    clearDraft(draftKey)

    if (nudgeThreadId) {
      await supabase.from('messages').insert({
        thread_id: nudgeThreadId,
        sender_user_id: user.id,
        body: `📋 New job posted: ${jobData.category}. Take a look and submit a bid if you're available.`,
      })
      fetch('/api/dm-job-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: nudgeThreadId, jobId: jobData.id }),
        keepalive: true,
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
          {t('backToUnitPlain', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-24" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">{t('createAJobHeading', lang)}</h1>
        <p className="text-white/50 text-sm mb-8">
          {t('createJobDesc', lang)}
        </p>

        {nudgeThreadId && (
          <div className="bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-xl px-4 py-3 mb-6">
            <p className="text-[#12A5A9] text-sm">
              {t('jobWillBePostedNudge', lang)}
            </p>
          </div>
        )}

        {draftRestored && (
          <div className="bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-3">
            <p className="text-[#12A5A9] text-sm">{t('draftRestored', lang)}</p>
            <button type="button" onClick={discardDraft} className="text-white/60 hover:text-white text-xs font-medium underline shrink-0">
              {t('discardDraftBtn', lang)}
            </button>
          </div>
        )}

        <ScrollReveal>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="landlord-job-category" className="text-white/70 text-sm block mb-1">{t('category', lang)}</label>
            <select
              id="landlord-job-category"
              name="category"
              value={form.category}
              onChange={handleChange}
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">{t('selectACategory', lang)}</option>
              {categoryGroups.map((group) => (
                <optgroup key={group.label} label={group.label} className="bg-[#0C1A2E]">
                  {group.categories.map((cat) => (
                    <option key={cat} value={cat} className="bg-[#0C1A2E]">{cat}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="landlord-job-location" className="text-white/70 text-sm block mb-1">{t('locationOptional', lang)}</label>
            <select
              id="landlord-job-location"
              name="location"
              value={form.location}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">{t('selectALocation', lang)}</option>
              {LOCATION_OPTIONS.map((loc) => (
                <option key={loc} value={loc} className="bg-[#0C1A2E]">{loc}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="landlord-job-description" className="text-white/70 text-sm block mb-1">{t('description', lang)}</label>
            <textarea
              id="landlord-job-description"
              name="description"
              value={form.description}
              onChange={handleChange}
              required
              rows={4}
              placeholder={t('whatNeedsToBeDone', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none"
            />
          </div>

          <div>
            <label htmlFor="landlord-job-urgency" className="text-white/70 text-sm block mb-1">{t('urgencyLabel', lang)}</label>
            <select
              id="landlord-job-urgency"
              name="urgency"
              value={form.urgency}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="low" className="bg-[#0C1A2E]">{t('lowOption', lang)}</option>
              <option value="normal" className="bg-[#0C1A2E]">{t('normalOption', lang)}</option>
              <option value="high" className="bg-[#0C1A2E]">{t('highOption', lang)}</option>
            </select>
          </div>

          <div>
            <span className="text-white/70 text-sm block mb-1">{t('photosOrVideosOptionalLabel', lang)}</span>
            <p className="text-white/40 text-xs mb-2">{t('videoLengthHint', lang)}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  aria-label={t('takePhotoLink', lang)}
                  className="sr-only peer"
                />
                <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#12A5A9]">
                  {t('takePhotoLink', lang)}
                </span>
              </label>
              <label className="relative">
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileChange}
                  aria-label={files.length > 0 ? t('addMoreBtn', lang) : t('addPhotosOrVideosPlain', lang)}
                  className="sr-only peer"
                />
                <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#12A5A9]">
                  {files.length > 0 ? t('addMoreBtn', lang) : t('addPhotosOrVideosPlain', lang)}
                </span>
              </label>
            </div>
            {files.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {files.map((file, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
                    {isVideoFile(file) ? (
                      <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" muted playsInline />
                    ) : (
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Selected ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={t('closeBtn', lang)}
                      className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/80 transition-all"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 bg-white/3 border border-white/8 rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-all">
            <input
              type="checkbox"
              checked={form.is_emergency}
              onChange={(e) => setForm({ ...form, is_emergency: e.target.checked })}
              className="w-4 h-4 mt-0.5"
            />
            <AlertTriangleIcon className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-white text-sm">{t('markAsEmergency', lang)}</span>
              <p className="text-white/50 text-xs mt-0.5">{t('emergencyExplain', lang)}</p>
            </div>
          </label>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {readyCheck.suggestion && (
            <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="text-[#12A5A9] text-xs font-bold shrink-0">✦</span>
              <p className="text-white/70 text-sm">{readyCheck.suggestion}</p>
            </div>
          )}

          <RippleButton
            type="submit"
            disabled={submitting || checkingReady}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {checkingReady
              ? t('aiCheckingDots', lang)
              : submitting
                ? t('creatingDots', lang)
                : readyCheck.suggestion
                  ? t('postAnywayBtn', lang)
                  : t('createJobBtn', lang)}
          </RippleButton>
        </form>
        </ScrollReveal>
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
