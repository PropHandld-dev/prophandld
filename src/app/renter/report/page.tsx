'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { notify } from '@/lib/notify'
import { compressImage } from '@/lib/imageCompress'
import { validateMediaFile, isVideoFile } from '@/lib/mediaValidation'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { AlertTriangleIcon } from '@/components/icons'
import { RENTER_TABS } from '@/lib/navTabs'
import { useGroupedCategoryOptions, CATEGORY_TO_ITEM_TYPE } from '@/lib/categories'
import { LOCATION_OPTIONS } from '@/lib/jobLocations'
import { TIME_WINDOWS } from '@/lib/scheduleWindows'
import { useLanguage, t } from '@/lib/i18n'
import { TroubleshootAssistant } from '@/components/TroubleshootAssistant'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'

const NO_TROUBLESHOOT_CATEGORIES = ['Electrical', 'Gas', 'Structural']

const MAX_AVAILABILITY_SLOTS = 3

const EMERGENCY_EXAMPLE_KEYS = [
  'emergencyExampleLeak',
  'emergencyExampleNoHeat',
  'emergencyExampleGas',
  'emergencyExampleLocks',
  'emergencyExampleSewage',
  'emergencyExampleElectrical',
] as const

// A soft nudge, not a block — these are things no contractor can act on
// (crime, violence, safety threats), so a tenant typing one of these
// words anywhere in the category or description sees a pointer to the
// police/landlord instead. Checked against the selected category too,
// not just "Other", since a custom category like "Theft" can get typed
// and reused by someone else without ever touching the "Other" field.
const NOT_MAINTENANCE_KEYWORDS = [
  'theft', 'stolen', 'steal', 'robbery', 'robbed', 'burglar', 'break-in', 'break in', 'broke in',
  'assault', 'violence', 'domestic', 'harassment', 'threat', 'weapon', 'gun', 'knife', 'stalking',
]

function mentionsNonMaintenanceIssue(...texts: string[]): boolean {
  const combined = texts.join(' ').toLowerCase()
  return NOT_MAINTENANCE_KEYWORDS.some((word) => combined.includes(word))
}

export default function ReportIssuePage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showEmergencyInfo, setShowEmergencyInfo] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  // Stable per-file preview URLs — recomputed only when the file list
  // itself changes, not on every keystroke elsewhere on the page. Without
  // this, a URL.createObjectURL(file) called inline in the render was
  // generating a brand-new blob URL on every render (e.g. every character
  // typed into access notes), which made an attached video's <video>
  // element reload and visibly flicker.
  const filePreviewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => {
    return () => { filePreviewUrls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [filePreviewUrls])
  const [systems, setSystems] = useState<any[]>([])
  const [aiAvailable, setAiAvailable] = useState(false)
  const [troubleshootCleared, setTroubleshootCleared] = useState(false)
  const [troubleshootTranscript, setTroubleshootTranscript] = useState<string | null>(null)
  const [troubleshootResolvedNoAction, setTroubleshootResolvedNoAction] = useState(false)
  // Optional — picking a few windows here up front is what lets a
  // contractor propose a time by just tapping one of these instead of a
  // separate back-and-forth after they're selected.
  const [availabilitySlots, setAvailabilitySlots] = useState<{ date: string; window: string }[]>([])

  const [form, setForm] = useState({
    category: '',
    location: '',
    urgency: 'normal',
    description: '',
    is_emergency: false,
    maintenance_item_id: '',
    access_notes: '',
  })
  const categoryGroups = useGroupedCategoryOptions()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)

      // Resolves to the caller's tenancy whether they're the primary
      // tenant or a co-renter added on the unit (tenancy_occupants).
      const { data: tenancyId } = await supabase.rpc('get_my_active_tenancy_id')
      const { data: tenancyData, error: tenancyError } = tenancyId
        ? await supabase.from('tenancies').select('unit_id').eq('id', tenancyId).maybeSingle()
        : { data: null, error: null }

      if (tenancyError || !tenancyData) {
        setError(t('noActiveUnitError', lang))
        setLoading(false)
        return
      }

      setUnitId(tenancyData.unit_id)

      const { data: systemsData } = await supabase
        .from('maintenance_items')
        .select('id, name, item_type, brand, model')
        .eq('unit_id', tenancyData.unit_id)

      setSystems(systemsData || [])
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!AI_ASSIST_ENABLED) return
    fetch('/api/ai-assist/renter-status')
      .then((res) => res.json())
      .then((data) => setAiAvailable(!!data.available))
      .catch(() => setAiAvailable(false))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement>) => {
    // A category change is a big enough shift that any troubleshooting
    // already done no longer applies to what's actually being reported —
    // re-offer it rather than silently carrying a stale transcript.
    if (e.target.name === 'category' && e.target.value !== form.category) {
      setTroubleshootCleared(false)
      setTroubleshootTranscript(null)
      setTroubleshootResolvedNoAction(false)
    }
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  // Trade-level match (any appliance, any plumbing fixture, etc.) — the
  // Related System dropdown below already works this way, reused here so
  // troubleshoot can auto-fill a known brand/model when there's only one
  // real candidate, without duplicating the filter logic.
  const matchingSystems = form.category ? systems.filter((s) => s.item_type === CATEGORY_TO_ITEM_TYPE[form.category]) : []

  const showTroubleshoot =
    aiAvailable &&
    !form.is_emergency &&
    !!form.category &&
    !NO_TROUBLESHOOT_CATEGORIES.some((c) => form.category.toLowerCase().includes(c.toLowerCase())) &&
    form.description.trim().length > 0 &&
    !troubleshootCleared

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
      const incoming = Array.from(e.target.files)
      // Previously bailed on the FIRST invalid file and discarded the
      // whole selection — attaching 5 photos where the 4th was an
      // oversized video lost all 5, not just the bad one. Now only the
      // bad file(s) get rejected, named in the error, and everything
      // valid still gets added.
      const valid: File[] = []
      const rejected: string[] = []
      for (const file of incoming) {
        const problem = validateMediaFile(file)
        if (problem) rejected.push(`${file.name}: ${problem}`)
        else valid.push(file)
      }
      setError(rejected.length > 0 ? rejected.join(' ') : null)
      if (valid.length > 0) setFiles([...files, ...valid])
    }
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const addAvailabilitySlot = () => {
    if (availabilitySlots.length >= MAX_AVAILABILITY_SLOTS) return
    setAvailabilitySlots([...availabilitySlots, { date: '', window: 'morning' }])
  }

  const updateAvailabilitySlot = (index: number, field: 'date' | 'window', value: string) => {
    setAvailabilitySlots(availabilitySlots.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const removeAvailabilitySlot = (index: number) => {
    setAvailabilitySlots(availabilitySlots.filter((_, i) => i !== index))
  }

  // transcriptOverride lets the troubleshoot "proceed" paths submit directly
  // with the transcript they already have in hand, instead of going through
  // setTroubleshootTranscript (state) and waiting a render cycle for a
  // second, separately-labeled Submit button to even appear — that extra
  // tap didn't let someone do anything they couldn't already do earlier in
  // the same form (photos/availability/access notes are all above the
  // troubleshoot panel, still editable while it's open), it was just a
  // second click doing the same thing "Post the report" already said.
  const handleSubmit = async (e: React.FormEvent | null, transcriptOverride?: string | null) => {
    e?.preventDefault()
    const effectiveTranscript = transcriptOverride !== undefined ? transcriptOverride : troubleshootTranscript

    if (!form.category) {
      setError(t('pleaseSelectACategory', lang))
      return
    }
    if (!form.description.trim()) {
      setError(t('pleaseDescribeTheIssue', lang))
      return
    }
    if (!unitId || !userId) {
      setError(t('couldNotIdentifyUnit', lang))
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
        location: form.location || null,
        urgency: form.is_emergency ? 'emergency' : form.urgency,
        description: effectiveTranscript
          ? `${form.description.trim()}\n\n[AI troubleshooting already tried]\n${effectiveTranscript}`
          : form.description.trim(),
        is_emergency: form.is_emergency,
        status: 'pending_approval',
        maintenance_item_id: form.maintenance_item_id || null,
        tenant_availability: availabilitySlots.filter((s) => s.date),
        access_notes: form.access_notes.trim() || null,
      })
      .select()
      .single()

    if (insertError || !jobData) {
      console.error('Error creating job:', insertError)
      setError(t('couldNotSubmitReport', lang))
      setSubmitting(false)
      return
    }

    // Photos are shrunk first and uploaded together rather than one after
    // another, which is most of the wait after tapping Submit on a phone.
    // Uploaded (and the landlord notified) BEFORE notify() fires, not
    // after — notifying first meant a landlord could open the job and
    // find it still photo-less, mid-upload or never arrived.
    const photoResults = await Promise.all(
      files.map(async (original) => {
        const file = await compressImage(original)
        const fileExt = file.name.split('.').pop()
        const filePath = `${jobData.id}/${crypto.randomUUID()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('job-photos')
          .upload(filePath, file)

        if (uploadError) {
          console.error('Error uploading photo:', uploadError)
          return false
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
          return false
        }
        return true
      })
    )

    notify('job_reported', jobData.id)

    // The job itself was already created successfully — a failed photo
    // isn't worth losing that over, but silently navigating away as if
    // everything worked (the previous behavior) left a renter believing
    // photos were attached when the job actually has none. Stay on this
    // page so the error is actually seen, rather than firing it into an
    // unmounting component on the way to the next screen.
    if (photoResults.some((ok) => !ok)) {
      setError(t('reportSubmittedPhotosFailed', lang))
      setSubmitting(false)
      return
    }

    router.push('/renter')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
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
          {t('dashboard', lang)}
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">{t('reportTitle', lang)}</h1>
        <p className="text-white/50 text-sm mb-8">{t('reportSubtitle', lang)}</p>

        {unitId && (
          <ScrollReveal>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('category', lang)}</label>
              <select
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
              <label className="text-white/70 text-sm block mb-1">{t('locationOptional', lang)}</label>
              <select
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

            {matchingSystems.length > 0 && (
              <div>
                <label className="text-white/70 text-sm block mb-1">{t('relatedSystemOptionalLabel', lang)}</label>
                <select
                  name="maintenance_item_id"
                  value={form.maintenance_item_id}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                >
                  <option value="" className="bg-[#0C1A2E]">{t('notSureNoneOption', lang)}</option>
                  {matchingSystems.map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#0C1A2E]">{s.name}</option>
                    ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('description', lang)}</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                required
                rows={4}
                placeholder={t('descriptionPlaceholder', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none"
              />
            </div>

            {mentionsNonMaintenanceIssue(form.category, form.description) && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm flex items-start gap-2">
                <AlertTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{t('notAMaintenanceIssueWarning', lang)}</span>
              </div>
            )}

            {!form.is_emergency && (
              <div>
                <label className="text-white/70 text-sm block mb-1">{t('urgencyLabel', lang)}</label>
                <select
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
            )}

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('photosOrVideosOptionalLabel', lang)}</label>
              <p className="text-white/40 text-xs mb-2">{t('videoHelpsHint', lang)}</p>
              <p className="text-white/40 text-xs mb-2">{t('videoLengthHint', lang)}</p>
              <label className="block mb-3">
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                  {files.length > 0 ? t('addMoreBtn', lang) : t('addPhotosOrVideosPlain', lang)}
                </span>
              </label>
              {files.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {files.map((file, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
                      {isVideoFile(file) ? (
                        <video src={filePreviewUrls[i]} className="w-full h-full object-cover" muted playsInline />
                      ) : (
                        <img
                          src={filePreviewUrls[i]}
                          alt={`Selected ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      )}
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

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('whenAreYouAroundLabel', lang)}</label>
              <p className="text-white/40 text-xs mb-2">{t('availabilityHint', lang)}</p>
              {availabilitySlots.map((slot, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="date"
                    value={slot.date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => updateAvailabilitySlot(i, 'date', e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                  />
                  <select
                    value={slot.window}
                    onChange={(e) => updateAvailabilitySlot(i, 'window', e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                  >
                    {TIME_WINDOWS.map((w) => (
                      <option key={w.value} value={w.value} className="bg-[#0C1A2E]">{w.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeAvailabilitySlot(i)}
                    className="text-red-400/70 hover:text-red-400 text-xs px-2 transition shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
              {availabilitySlots.length < MAX_AVAILABILITY_SLOTS && (
                <button
                  type="button"
                  onClick={addAvailabilitySlot}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline"
                >
                  {t('addTimeFreeBtn', lang)}
                </button>
              )}
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('accessNotesLabel', lang)}</label>
              <textarea
                name="access_notes"
                value={form.access_notes}
                onChange={handleChange}
                rows={2}
                placeholder={t('accessNotesPlaceholder', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none"
              />
              <p className="text-white/40 text-xs mt-1">{t('accessNotesHint', lang)}</p>
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
                  <AlertTriangleIcon className="w-4 h-4" /> {t('thisIsEmergency', lang)}
                </p>
                <p className="text-white/60 text-xs mt-1">{t('emergencyExplain', lang)}</p>
              </div>
              <span
                className={
                  form.is_emergency
                    ? 'shrink-0 bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-lg'
                    : 'shrink-0 bg-red-500/15 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg'
                }
              >
                {form.is_emergency ? t('marked', lang) : t('markAsEmergency', lang)}
              </span>
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {showTroubleshoot ? (
              <TroubleshootAssistant
                category={form.category}
                description={form.description}
                knownAppliance={
                  // Explicitly picked from the Related System dropdown
                  // always wins. Otherwise, if there's exactly one tracked
                  // appliance on this unit at all, it's safe to use without
                  // making the renter pick it — the dropdown's own match is
                  // by trade (any appliance), not the specific category, so
                  // more than one candidate isn't a safe guess.
                  systems.find((s) => s.id === form.maintenance_item_id) ||
                  (matchingSystems.length === 1 ? matchingSystems[0] : null)
                }
                photos={files}
                onDone={(action, transcript) => {
                  setTroubleshootTranscript(transcript)
                  setTroubleshootCleared(true)
                  if (action === 'resolved') {
                    setTroubleshootResolvedNoAction(true)
                    return
                  }
                  handleSubmit(null, transcript)
                }}
              />
            ) : troubleshootResolvedNoAction ? (
              <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-2xl p-4 flex items-center justify-between gap-3">
                <p className="text-white/70 text-sm">{t('troubleshootResolvedFooter', lang)}</p>
                <Link href="/renter" className="text-[#12A5A9] text-sm font-semibold hover:underline shrink-0">
                  {t('dashboard', lang)}
                </Link>
              </div>
            ) : (
              <RippleButton
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? t('submitting', lang) : t('submitReport', lang)}
              </RippleButton>
            )}
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
            <h3 className="text-white font-semibold mb-3">{t('emergencyModalTitle', lang)}</h3>
            <p className="text-white/50 text-sm mb-3">{t('emergencyModalSubtitle', lang)}</p>
            <ul className="space-y-1.5 mb-5">
              {EMERGENCY_EXAMPLE_KEYS.map((key) => (
                <li key={key} className="text-white/70 text-sm flex items-start gap-2">
                  <span className="text-red-400">•</span> {t(key, lang)}
                </li>
              ))}
            </ul>
            <p className="text-white/50 text-xs mb-5">
              {t('emergencyModalWarning', lang)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEmergencyInfo(false)}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition"
              >
                {t('notAnEmergencyBtn', lang)}
              </button>
              <button
                onClick={confirmEmergency}
                className="flex-1 bg-red-500/20 text-red-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-500/30 transition"
              >
                {t('yesItsUrgentBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}