'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { AlertTriangleIcon, CheckCircleIcon, FileTextIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t, type Lang } from '@/lib/i18n'
import { getLandlordIds } from '@/lib/landlordIds'
import { validateDocumentFile } from '@/lib/mediaValidation'
import { getComplianceStatus } from '@/lib/complianceStatus'
import { useConfirm } from '@/lib/useConfirm'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'

const ITEM_TYPE_KEYS: ('complianceItemRentalLicense' | 'complianceItemLeadCertification' | 'complianceItemSmokeDetector' | 'complianceItemCoDetector' | 'complianceItemFireExtinguisher' | 'complianceItemInsuranceRenewal')[] = [
  'complianceItemRentalLicense',
  'complianceItemLeadCertification',
  'complianceItemSmokeDetector',
  'complianceItemCoDetector',
  'complianceItemFireExtinguisher',
  'complianceItemInsuranceRenewal',
]

// The English item_type values are what's actually stored in the database
// (compliance_items.item_type) — these stay fixed regardless of display
// language, same policy as job categories elsewhere in the app.
const ITEM_TYPES = [
  'Rental License',
  'Lead Certification',
  'Smoke Detector Inspection',
  'CO Detector Inspection',
  'Fire Extinguisher Inspection',
  'Insurance Renewal',
  'Other',
]

const itemTypeDisplayLabel = (value: string, lang: Lang) => {
  const idx = ITEM_TYPES.indexOf(value)
  if (idx >= 0 && idx < ITEM_TYPE_KEYS.length) return t(ITEM_TYPE_KEYS[idx], lang)
  return value
}

export default function PropertyCompliancePage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
  const propertyId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [property, setProperty] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [itemDocuments, setItemDocuments] = useState<Record<string, any>>({})
  const [error, setError] = useState<string | null>(null)
  const [aiAssistActive, setAiAssistActive] = useState(false)
  const [aiReading, setAiReading] = useState(false)
  const [gapSuggestions, setGapSuggestions] = useState<{ itemType: string; why: string }[] | null>(null)
  const [gapChecking, setGapChecking] = useState(false)
  const [gapError, setGapError] = useState<string | null>(null)

  const [form, setForm] = useState({
    item_type: '',
    custom_item_type: '',
    expiry_date: '',
    reminder_days: '30',
    reminder_channels: ['email', 'push'] as string[],
  })

  const toggleReminderChannel = (channel: string) => {
    setForm((f) => ({
      ...f,
      reminder_channels: f.reminder_channels.includes(channel)
        ? f.reminder_channels.filter((c) => c !== channel)
        : [...f.reminder_channels, channel],
    }))
  }
  const [file, setFile] = useState<File | null>(null)

  const [renewingId, setRenewingId] = useState<string | null>(null)
  const [renewDate, setRenewDate] = useState('')
  const [renewFile, setRenewFile] = useState<File | null>(null)
  const [renewExtracting, setRenewExtracting] = useState(false)
  const [renewExtractedType, setRenewExtractedType] = useState<string | null>(null)
  const [attachingId, setAttachingId] = useState<string | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)

      const landlordIds = await getLandlordIds(supabase, user.id)
      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .in('owner_user_id', landlordIds)
        .single()

      if (propertyError || !propertyData) {
        router.replace('/landlord/properties')
        return
      }
      setProperty(propertyData)

      await loadItems()
      setLoading(false)
    }
    init()
  }, [propertyId, router])

  useEffect(() => {
    if (!AI_ASSIST_ENABLED) return
    fetch('/api/ai-assist/status')
      .then((res) => res.json())
      .then((data) => setAiAssistActive(data.enabled && (data.status === 'trialing' || data.status === 'active')))
      .catch(() => setAiAssistActive(false))
  }, [])

  const extractComplianceFields = async (docFile: File) => {
    const mediaType = docFile.type || (docFile.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mediaType)) return
    setAiReading(true)
    try {
      const fileBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
        reader.onerror = reject
        reader.readAsDataURL(docFile)
      })
      const res = await fetch('/api/ai-assist/extract/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64, mediaType }),
      })
      const data = await res.json()
      if (res.ok && data.extracted) {
        setForm((prev) => ({
          ...prev,
          item_type: !prev.item_type && data.extracted.item_type ? data.extracted.item_type : prev.item_type,
          expiry_date: !prev.expiry_date && data.extracted.expiry_date ? data.extracted.expiry_date : prev.expiry_date,
        }))
      }
    } catch (err) {
      console.error('AI compliance extraction failed:', err)
    }
    setAiReading(false)
  }

  // Renewing used to be nothing more than typing in whatever date someone
  // felt like — Joshua's real complaint: a landlord "resolves" an expired
  // rental license by just picking a new date, no proof it was actually
  // renewed. This reads the renewal document the same way a new item's
  // upload does, pre-fills the date from what's actually printed on it,
  // and surfaces what AI read the document AS so a landlord attaching the
  // wrong file (an insurance cert while renewing a license, say) sees the
  // mismatch before saving instead of silently overwriting the expiry with
  // an unrelated document's date.
  const extractRenewalFields = async (docFile: File) => {
    const mediaType = docFile.type || (docFile.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mediaType)) return
    setRenewExtracting(true)
    setRenewExtractedType(null)
    try {
      const fileBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
        reader.onerror = reject
        reader.readAsDataURL(docFile)
      })
      const res = await fetch('/api/ai-assist/extract/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64, mediaType }),
      })
      const data = await res.json()
      if (res.ok && data.extracted) {
        if (data.extracted.expiry_date) setRenewDate(data.extracted.expiry_date)
        if (data.extracted.item_type) setRenewExtractedType(data.extracted.item_type)
      }
    } catch (err) {
      console.error('AI renewal extraction failed:', err)
    }
    setRenewExtracting(false)
  }

  const checkComplianceGaps = async () => {
    setGapChecking(true)
    setGapError(null)
    try {
      const res = await fetch('/api/ai-assist/compliance-gap-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGapError(data.error || t('aiGapCheckFailed', lang))
        setGapChecking(false)
        return
      }
      setGapSuggestions(data.suggestions || [])
    } catch {
      setGapError(t('aiGapCheckFailed', lang))
    }
    setGapChecking(false)
  }

  const trackSuggestion = (itemType: string) => {
    const matched = ITEM_TYPES.includes(itemType)
    setForm((prev) => ({ ...prev, item_type: matched ? itemType : 'Other', custom_item_type: matched ? '' : itemType }))
    setGapSuggestions((prev) => (prev ? prev.filter((s) => s.itemType !== itemType) : prev))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadItems = async () => {
    const { data: itemsData, error: itemsError } = await supabase
      .from('compliance_items')
      .select('*')
      .eq('property_id', propertyId)
      .order('expiry_date', { ascending: true, nullsFirst: false })

    if (itemsError) {
      console.error('Error loading compliance items:', itemsError)
      return
    }
    setItems(itemsData || [])

    if (!itemsData || itemsData.length === 0) {
      setItemDocuments({})
      return
    }

    const { data: docsData, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .in('compliance_item_id', itemsData.map((i) => i.id))

    if (docsError) {
      console.error('Error loading attached documents:', docsError)
      return
    }

    const enriched: Record<string, any> = {}
    await Promise.all(
      (docsData || []).map(async (doc) => {
        const { data: signedUrlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_url, 3600)
        enriched[doc.compliance_item_id] = { ...doc, viewUrl: signedUrlData?.signedUrl }
      })
    )
    setItemDocuments(enriched)
  }

  const uploadComplianceDocument = async (complianceItemId: string, documentType: string, docFile: File) => {
    if (!userId) return

    const validationError = validateDocumentFile(docFile)
    if (validationError) {
      setError(validationError)
      return
    }

    const ext = docFile.name.split('.').pop()
    const filePath = `${propertyId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, docFile)

    if (uploadError) {
      console.error('Error uploading compliance document:', uploadError)
      setError(t('couldNotUploadDocumentColon', lang))
      return
    }

    const { error: docInsertError } = await supabase
      .from('documents')
      .insert({
        property_id: propertyId,
        uploaded_by: userId,
        document_type: documentType,
        filename: docFile.name,
        file_url: filePath,
        compliance_item_id: complianceItemId,
      })

    if (docInsertError) {
      console.error('Error linking compliance document:', docInsertError)
      // The file itself did upload — without this, it sits permanently
      // orphaned in storage with no documents row ever pointing to it,
      // since nothing else will ever retry or clean it up.
      const { error: cleanupError } = await supabase.storage.from('documents').remove([filePath])
      if (cleanupError) console.error('Error cleaning up orphaned compliance document after failed insert:', cleanupError)
      setError(t('documentUploadedNotLinked', lang))
    }
  }

  const handleAttachToItem = async (item: any, selectedFile: File) => {
    setAttachingId(item.id)
    setError(null)
    await uploadComplianceDocument(item.id, item.item_type, selectedFile)
    await loadItems()
    setAttachingId(null)
  }

  const handleRemoveAttachment = async (doc: any) => {
    if (!(await confirm({ body: `${t('removeAttachmentConfirmPrefix', lang)}${doc.filename}${t('removeAttachmentConfirmSuffix', lang)}`, danger: true }))) return

    const { error: storageError } = await supabase.storage.from('documents').remove([doc.file_url])
    if (storageError) {
      // Used to continue to the DB delete anyway — the storage file would
      // silently survive as a permanent orphan (nothing left pointing to
      // it) while the landlord saw no error and believed it was gone.
      console.error('Error deleting document file:', storageError)
      setError(t('couldNotRemoveDocumentColon', lang))
      return
    }

    const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id)
    if (deleteError) {
      console.error('Error deleting document record:', deleteError)
      setError(t('couldNotRemoveDocumentColon', lang))
      return
    }

    await loadItems()
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.item_type) {
      setError(t('pleaseSelectAType', lang))
      return
    }
    if (form.item_type === 'Other' && !form.custom_item_type.trim()) {
      setError(t('pleaseEnterAType', lang))
      return
    }

    setSaving(true)
    setError(null)

    const itemType = form.item_type === 'Other' ? form.custom_item_type.trim() : form.item_type

    const { data: newItem, error: insertError } = await supabase
      .from('compliance_items')
      .insert({
        property_id: propertyId,
        item_type: itemType,
        expiry_date: form.expiry_date || null,
        reminder_days: form.reminder_days ? parseInt(form.reminder_days) : 30,
        reminder_channels: form.reminder_channels,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error adding compliance item:', insertError)
      setError(t('couldNotAddItemColon', lang))
      setSaving(false)
      return
    }

    if (file && newItem) {
      await uploadComplianceDocument(newItem.id, itemType, file)
    }

    setForm({ item_type: '', custom_item_type: '', expiry_date: '', reminder_days: '30', reminder_channels: ['email', 'push'] })
    setFile(null)
    await loadItems()
    setSaving(false)
  }

  const startRenew = (item: any) => {
    setRenewingId(item.id)
    setRenewDate(item.expiry_date || '')
    setRenewFile(null)
    setRenewExtractedType(null)
    setError(null)
  }

  const cancelRenew = () => {
    setRenewingId(null)
    setRenewDate('')
    setRenewFile(null)
    setRenewExtractedType(null)
  }

  const saveRenew = async (item: any) => {
    if (!renewDate) {
      setError(t('pleasePickNewExpiryDate', lang))
      return
    }

    const { error: updateError } = await supabase
      .from('compliance_items')
      .update({ expiry_date: renewDate, last_reminder_status: null })
      .eq('id', item.id)

    if (updateError) {
      console.error('Error renewing item:', updateError)
      setError(t('couldNotSaveChangesColon', lang))
      return
    }

    // Attached last, after the date itself is safely saved — if this part
    // fails, the renewal still went through and the landlord can attach
    // the document separately via the same upload control every item
    // already has below.
    if (renewFile) {
      await uploadComplianceDocument(item.id, item.item_type, renewFile)
    }

    setRenewingId(null)
    setRenewDate('')
    setRenewFile(null)
    setRenewExtractedType(null)
    await loadItems()
  }

  const handleDelete = async (item: any) => {
    if (!(await confirm({ body: `${t('removeAttachmentConfirmPrefix', lang)}${item.item_type}${t('removeAttachmentConfirmSuffix', lang)}`, danger: true }))) return

    // Clean up any attached document explicitly rather than relying on an
    // unverified DB-level cascade (this table was created directly in the
    // Supabase SQL editor, not via an in-repo migration, so its ON DELETE
    // behavior can't be confirmed from code) — without this, deleting the
    // item either orphans the document's storage file forever, or the
    // delete below fails outright with no indication a document was the
    // blocker.
    const attachedDoc = itemDocuments[item.id]
    if (attachedDoc) {
      const { error: storageError } = await supabase.storage.from('documents').remove([attachedDoc.file_url])
      if (storageError) {
        console.error('Error deleting attached document file:', storageError)
        setError(t('couldNotDeleteItemColon', lang))
        return
      }
      const { error: docDeleteError } = await supabase.from('documents').delete().eq('id', attachedDoc.id)
      if (docDeleteError) {
        console.error('Error deleting attached document record:', docDeleteError)
        setError(t('couldNotDeleteItemColon', lang))
        return
      }
    }

    const { error: deleteError } = await supabase.from('compliance_items').delete().eq('id', item.id)
    if (deleteError) {
      console.error('Error deleting compliance item:', deleteError)
      setError(t('couldNotDeleteItemColon', lang))
      return
    }

    setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  // `key` is the stable, untranslated identifier to branch UI logic on
  // (which icon to show, etc.) — `label` is only for display. Comparing
  // logic against `label` broke the moment it got translated, since the
  // translated string never equals the English literal being checked.
  const getExpiryStatus = (item: any) => {
    const { key } = getComplianceStatus(item.expiry_date, item.reminder_days)
    if (key === 'no_expiry') return { key, label: t('noExpirySet', lang), color: 'bg-white/8 text-white/50' }
    if (key === 'expired') return { key, label: t('expiredStatus', lang), color: 'bg-red-500/15 text-red-400' }
    if (key === 'expiring_soon') return { key, label: t('expiringSoonStatus', lang), color: 'bg-yellow-500/15 text-yellow-400' }
    return { key, label: t('currentStatus', lang), color: 'bg-[#12A5A9]/15 text-[#12A5A9]' }
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          {t('backToPropertyArrow', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <div className="mb-8">
              <Skeleton className="h-7 w-40 mb-2" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-52 mb-6" />
            <Skeleton className="h-5 w-24 mb-4" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : !property ? null : (
        <>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{t('complianceHeading', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">{property.address}</p>
        </div>

        {aiAssistActive && (
          <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5">✦ AI</span>
              <p className="text-white text-sm font-semibold">{t('aiGapCheckTitle', lang)}</p>
            </div>
            {gapSuggestions === null ? (
              <>
                <p className="text-white/60 text-xs mb-3">{t('aiGapCheckDesc', lang)}</p>
                <button
                  type="button"
                  onClick={checkComplianceGaps}
                  disabled={gapChecking}
                  className="text-xs font-semibold text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-lg px-3 py-2 hover:bg-[#12A5A9]/15 transition disabled:opacity-50"
                >
                  {gapChecking ? t('aiGapChecking', lang) : t('aiGapCheckCta', lang)}
                </button>
              </>
            ) : gapSuggestions.length === 0 ? (
              <p className="text-white/50 text-xs">{t('aiGapCheckNone', lang)}</p>
            ) : (
              <div className="space-y-2">
                {gapSuggestions.map((s) => (
                  <div key={s.itemType} className="flex items-center justify-between gap-3 bg-white/5 border border-white/8 rounded-xl px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium">{s.itemType}</p>
                      <p className="text-white/50 text-xs mt-0.5">{s.why}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => trackSuggestion(s.itemType)}
                      className="shrink-0 text-xs font-semibold text-[#12A5A9] hover:underline"
                    >
                      {t('aiGapCheckTrackBtn', lang)}
                    </button>
                  </div>
                ))}
                <p className="text-white/30 text-[11px] pt-1">{t('aiGapCheckDisclaimer', lang)}</p>
              </div>
            )}
            {gapError && <p className="text-red-400 text-xs mt-2">{gapError}</p>}
          </div>
        )}

        <ScrollReveal>
        <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold mb-2">{t('trackAnItemHeading', lang)}</h2>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('typeLabel', lang)}</label>
            <select
              name="item_type"
              value={form.item_type}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">{t('selectAType', lang)}</option>
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type} className="bg-[#0C1A2E]">{type === 'Other' ? t('itemTypeOther', lang) : itemTypeDisplayLabel(type, lang)}</option>
              ))}
            </select>
            {form.item_type === 'Other' && (
              <input
                type="text"
                name="custom_item_type"
                value={form.custom_item_type}
                onChange={handleChange}
                placeholder={t('enterATypePlaceholder', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition mt-2"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('expiryDateLabelFull', lang)}</label>
              <input
                type="date"
                name="expiry_date"
                value={form.expiry_date}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('remindMeDaysBeforeLabel', lang)}</label>
              <input
                type="number"
                name="reminder_days"
                value={form.reminder_days}
                onChange={handleChange}
                min={0}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('remindMeViaLabel', lang)}</label>
            <div className="flex gap-4">
              {(['email', 'push', 'sms'] as const).map((channel) => (
                <label key={channel} className="flex items-center gap-1.5 text-white/70 text-sm">
                  <input
                    type="checkbox"
                    checked={form.reminder_channels.includes(channel)}
                    onChange={() => toggleReminderChannel(channel)}
                    className="accent-[#12A5A9]"
                  />
                  {channel === 'email' ? t('emailLabel', lang) : channel === 'push' ? t('pushLabel', lang) : t('smsLabel', lang)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('attachDocumentOptionalLabel', lang)}</label>
            <label className="block">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  const selected = e.target.files?.[0] || null
                  if (selected) {
                    const validationError = validateDocumentFile(selected)
                    if (validationError) {
                      setError(validationError)
                      e.target.value = ''
                      return
                    }
                  }
                  setError(null)
                  setFile(selected)
                  if (selected && aiAssistActive) extractComplianceFields(selected)
                }}
                className="hidden"
              />
              <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                {file ? file.name : t('chooseFileBtn', lang)}
              </span>
            </label>
            {aiAssistActive && (
              <p className="text-[#12A5A9] text-xs mt-2">
                {aiReading ? `✦ ${t('aiLeaseUploadReading', lang)}` : `✦ ${t('aiComplianceAutoFillHint', lang)}`}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <RippleButton
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('addingDots', lang) : t('addItemBtn', lang)}
          </RippleButton>
        </form>
        </ScrollReveal>

        <h2 className="text-white font-semibold mb-4">
          {t('allItemsHeading', lang)} {items.length > 0 && `(${items.length})`}
        </h2>

        {items.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('noComplianceItemsYet', lang)}</p>
          </div>
        ) : (
          <ScrollReveal>
          <div className="space-y-3">
            {items.map((item) => {
              const status = getExpiryStatus(item)
              const isRenewing = renewingId === item.id
              return (
                <div key={item.id} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate">{itemTypeDisplayLabel(item.item_type, lang)}</h3>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-0.5 ${status.color}`}>
                          {status.key === 'expired' && <AlertTriangleIcon className="w-3 h-3" />}
                          {status.key === 'current' && <CheckCircleIcon className="w-3 h-3" />}
                          {status.label}
                        </span>
                        {item.expiry_date && (
                          <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                            {t('expiresOnPrefix', lang)} {new Date(item.expiry_date + 'T00:00:00').toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {!isRenewing && (
                        <button
                          onClick={() => startRenew(item)}
                          className="text-[#12A5A9] text-xs font-semibold hover:underline"
                        >
                          {t('renewBtn', lang)}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-red-400/70 text-xs hover:text-red-400 transition"
                      >
                        {t('deleteBtn', lang)}
                      </button>
                    </div>
                  </div>

                  {isRenewing && (
                    <div className="mt-4 space-y-2.5">
                      <label className="block">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={(e) => {
                            const selected = e.target.files?.[0] || null
                            if (selected) {
                              const validationError = validateDocumentFile(selected)
                              if (validationError) {
                                setError(validationError)
                                e.target.value = ''
                                return
                              }
                            }
                            setError(null)
                            setRenewFile(selected)
                            setRenewExtractedType(null)
                            if (selected && aiAssistActive) extractRenewalFields(selected)
                          }}
                          className="hidden"
                        />
                        <span className="inline-block bg-white/8 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-white/12 transition cursor-pointer">
                          {renewFile ? renewFile.name : t('attachRenewedDocumentBtn', lang)}
                        </span>
                      </label>
                      {aiAssistActive && renewFile && (
                        <p className="text-[#12A5A9] text-xs">
                          {renewExtracting
                            ? `✦ ${t('aiLeaseUploadReading', lang)}`
                            : renewExtractedType
                              ? `✦ ${t('aiReadThisAsPrefix', lang)} ${itemTypeDisplayLabel(renewExtractedType, lang)}`
                              : `✦ ${t('aiComplianceAutoFillHint', lang)}`}
                        </p>
                      )}
                      {renewExtractedType && renewExtractedType !== item.item_type && (
                        <p className="text-yellow-400 text-xs font-semibold">{t('renewDocumentMismatchWarning', lang)}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={renewDate}
                          onChange={(e) => setRenewDate(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                        />
                        <button
                          onClick={() => saveRenew(item)}
                          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition"
                        >
                          {t('saveBtn', lang)}
                        </button>
                        <button
                          onClick={cancelRenew}
                          className="text-white/50 hover:text-white text-xs px-2 transition"
                        >
                          {t('cancelBtn', lang)}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
                    {itemDocuments[item.id] ? (
                      <>
                        <FileTextIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
                        {itemDocuments[item.id].viewUrl && (
                          <a
                            href={itemDocuments[item.id].viewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#12A5A9] text-xs font-semibold hover:underline"
                          >
                            {t('viewAttachedDocumentArrow', lang)}
                          </a>
                        )}
                        <button
                          onClick={() => handleRemoveAttachment(itemDocuments[item.id])}
                          className="text-red-400/70 text-xs hover:text-red-400 transition ml-auto"
                        >
                          {t('removeBtn', lang)}
                        </button>
                      </>
                    ) : (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          className="hidden"
                          onChange={(e) => {
                            const selected = e.target.files?.[0]
                            if (selected) {
                              handleAttachToItem(item, selected)
                            }
                            e.target.value = ''
                          }}
                        />
                        <span className="text-[#12A5A9] text-xs font-semibold hover:underline">
                          {attachingId === item.id ? t('uploadingDots', lang) : t('attachDocumentBtn', lang)}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </ScrollReveal>
        )}
        </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
      {ConfirmDialog}
    </div>
  )
}
