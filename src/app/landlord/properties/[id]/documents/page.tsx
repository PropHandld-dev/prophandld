'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { FileTextIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

const DOCUMENT_TYPES = ['Lease', 'Rental Agreement', 'Deed', 'Insurance', 'Inspection Report', 'Other']

// Sanitizes a name for use inside a zip archive — nothing more than
// collapsing whatever would otherwise produce a nested "folder" or an
// invalid character most zip tools choke on.
function safeZipName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '-')
}

export default function PropertyDocumentsPage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
  const propertyId = params.id as string

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [property, setProperty] = useState<any>(null)
  const [units, setUnits] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

  const [form, setForm] = useState({
    document_type: '',
    custom_document_type: '',
    unit_id: '',
    // Matches how every existing document already behaves — tenants can
    // see it. Switch to landlord-only for anything more private (a deed,
    // an inspection report you don't want a tenant seeing).
    visibility: 'shared',
  })
  const [files, setFiles] = useState<File[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)

      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .eq('owner_user_id', user.id)
        .single()

      if (propertyError || !propertyData) {
        router.replace('/landlord/properties')
        return
      }
      setProperty(propertyData)

      const { data: unitsData } = await supabase
        .from('units')
        .select('*')
        .eq('property_id', propertyId)
        .order('unit_number')

      if (unitsData) setUnits(unitsData)

      await loadDocuments()
      setLoading(false)
    }
    init()
  }, [propertyId, router])

  const loadDocuments = async () => {
    const { data: documentsData, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })

    if (documentsError) {
      console.error('Error loading documents:', documentsError)
      return
    }

    if (!documentsData || documentsData.length === 0) {
      setDocuments([])
      return
    }

    // Water bills are attached to a rent month; look that up so the list can
    // say which month a bill belongs to instead of just "IMG_2515.jpeg".
    const { data: waterLinks } = await supabase
      .from('rent_payments')
      .select('*')
      .in('water_bill_document_id', documentsData.map((d) => d.id))
    const waterByDocument = new Map((waterLinks || []).map((r: any) => [r.water_bill_document_id, r]))

    const enriched = await Promise.all(
      documentsData.map(async (doc) => {
        const { data: signedUrlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_url, 3600)

        return { ...doc, viewUrl: signedUrlData?.signedUrl, rentMonth: waterByDocument.get(doc.id)?.month || null, waterPeriodStart: waterByDocument.get(doc.id)?.water_period_start || null, waterPeriodEnd: waterByDocument.get(doc.id)?.water_period_end || null }
      })
    )

    setDocuments(enriched)
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
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

    if (!form.document_type) {
      setError('Please select a document type.')
      return
    }
    if (form.document_type === 'Other' && !form.custom_document_type.trim()) {
      setError('Please enter a document type.')
      return
    }
    if (files.length === 0) {
      setError('Please choose at least one file.')
      return
    }
    if (!userId) return

    setUploading(true)
    setError(null)

    const documentType = form.document_type === 'Other'
      ? form.custom_document_type.trim()
      : form.document_type

    for (const file of files) {
      const fileExt = file.name.split('.').pop()
      const filePath = `${propertyId}/${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Error uploading document:', uploadError)
        setError('One or more files failed to upload.')
        continue
      }

      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          property_id: propertyId,
          unit_id: form.unit_id || null,
          uploaded_by: userId,
          uploaded_by_role: 'landlord',
          document_type: documentType,
          filename: file.name,
          file_url: filePath,
          visibility: form.visibility,
        })

      if (insertError) {
        console.error('Error saving document record:', insertError)
        setError('One or more files failed to save.')
      }
    }

    setFiles([])
    setForm({ document_type: '', custom_document_type: '', unit_id: '', visibility: 'shared' })
    await loadDocuments()
    setUploading(false)
  }

  const handleDelete = async (doc: any) => {
    if (!window.confirm(`Remove "${doc.filename}"?`)) return

    const { error: storageError } = await supabase.storage.from('documents').remove([doc.file_url])
    if (storageError) {
      console.error('Error deleting document file:', storageError)
    }

    const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id)
    if (deleteError) {
      console.error('Error deleting document record:', deleteError)
      setError('Could not delete document.')
      return
    }

    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
  }

  const handleDownloadAll = async () => {
    if (documents.length === 0) return
    setDownloadingAll(true)
    setError(null)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const usedNames = new Set<string>()

      await Promise.all(
        documents.map(async (doc) => {
          if (!doc.viewUrl) return
          try {
            const res = await fetch(doc.viewUrl)
            const blob = await res.blob()
            let name = safeZipName(doc.filename || `document-${doc.id}`)
            // Two documents can share a filename — number the second one
            // rather than silently overwrite it inside the zip.
            let attempt = name
            let n = 2
            while (usedNames.has(attempt)) {
              const dot = name.lastIndexOf('.')
              attempt = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
              n++
            }
            usedNames.add(attempt)
            zip.file(attempt, blob)
          } catch (err) {
            console.error('Error fetching document for zip:', doc.filename, err)
          }
        })
      )

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${property?.address || 'documents'} - documents.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error building document archive:', err)
      setError('Could not build the download. Try again.')
    }
    setDownloadingAll(false)
  }

  const getUnitLabel = (unitId: string | null) => {
    if (!unitId) return t('propertyWide', lang)
    const unit = units.find((u) => u.id === unitId)
    return unit ? unit.unit_number : t('unknownUnit', lang)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          {t('propertyBack', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <div className="mb-8">
              <Skeleton className="h-7 w-36 mb-2" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-64 mb-6" />
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : !property ? null : (
        <>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{t('documentsTitle', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">{property.address}</p>
        </div>

        <ScrollReveal>
        <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold mb-2">{t('uploadADocument', lang)}</h2>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('typeLabel', lang)}</label>
            <select
              name="document_type"
              value={form.document_type}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">{t('selectAType', lang)}</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type} className="bg-[#0C1A2E]">{type}</option>
              ))}
            </select>
            {form.document_type === 'Other' && (
              <input
                type="text"
                name="custom_document_type"
                value={form.custom_document_type}
                onChange={handleChange}
                placeholder={t('enterDocumentType', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition mt-2"
              />
            )}
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('appliesTo', lang)}</label>
            <select
              name="unit_id"
              value={form.unit_id}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">{t('propertyWide', lang)}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id} className="bg-[#0C1A2E]">
                  {unit.unit_number} {t('unitOnly', lang)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('whoCanSeeThis', lang)}</label>
            <select
              name="visibility"
              value={form.visibility}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="shared" className="bg-[#0C1A2E]">{t('landlordAndTenant', lang)}</option>
              <option value="landlord_only" className="bg-[#0C1A2E]">{t('landlordOnlyOption', lang)}</option>
            </select>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('filesLabel', lang)}</label>
            <label className="block">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                {files.length > 0 ? t('addMoreFiles', lang) : t('chooseFiles', lang)}
              </span>
            </label>
            {files.length > 0 && (
              <div className="space-y-2 mt-3">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-white/70 text-sm truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-red-400/70 text-xs hover:text-red-400 transition shrink-0 ml-3"
                    >
                      {t('remove', lang)}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <RippleButton
            type="submit"
            disabled={uploading}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? t('uploading', lang) : t('upload', lang)}
          </RippleButton>
        </form>
        </ScrollReveal>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">
            {t('allDocuments', lang)} {documents.length > 0 && `(${documents.length})`}
          </h2>
          {documents.length > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloadingAll}
              className="text-[#12A5A9] text-sm font-semibold hover:underline disabled:opacity-50"
            >
              {downloadingAll ? t('buildingDownload', lang) : t('downloadAll', lang)}
            </button>
          )}
        </div>

        {documents.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('noDocumentsYet', lang)}</p>
          </div>
        ) : (
          <ScrollReveal>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex items-start gap-3">
                    <FileTextIcon className="w-4 h-4 text-white/60 shrink-0 mt-1" />
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate">
                        {doc.rentMonth
                          ? doc.waterPeriodStart && doc.waterPeriodEnd
                            ? `${t('waterBillLabel', lang)} · ${new Date(doc.waterPeriodStart + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(doc.waterPeriodEnd + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                            : `${t('waterBillLabel', lang)} · ${new Date(doc.rentMonth + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
                          : doc.filename}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {doc.document_type && (
                          <span className="text-xs bg-[#12A5A9]/15 text-[#12A5A9] rounded-full px-2.5 py-0.5">
                            {doc.document_type}
                          </span>
                        )}
                        <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                          {getUnitLabel(doc.unit_id)}
                        </span>
                        {doc.compliance_item_id && (
                          <span className="text-xs bg-yellow-500/15 text-yellow-400 rounded-full px-2.5 py-0.5">
                            {t('complianceBadge', lang)}
                          </span>
                        )}
                        {doc.uploaded_by_role === 'renter' && (
                          <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                            {t('fromTenant', lang)}
                          </span>
                        )}
                        <span className={`text-xs rounded-full px-2.5 py-0.5 ${doc.visibility === 'landlord_only' ? 'bg-white/8 text-white/50' : 'bg-[#0A7B7E]/15 text-[#12A5A9]'}`}>
                          {doc.visibility === 'landlord_only' ? t('landlordOnlyOption', lang) : t('sharedWithTenant', lang)}
                        </span>
                        {doc.expiry_date && (
                          <span className={`text-xs rounded-full px-2.5 py-0.5 ${new Date(doc.expiry_date + 'T00:00:00') < new Date() ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                            {t('expiresLabel', lang)} {new Date(doc.expiry_date + 'T00:00:00').toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-white/50 text-xs mt-2">
                        {doc.rentMonth && doc.waterPeriodStart
                          ? lang === 'es'
                            ? `Facturado con la renta de ${new Date(doc.rentMonth + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · `
                            : `Billed with ${new Date(doc.rentMonth + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} rent · `
                          : ''}
                        {doc.rentMonth ? `${doc.filename} · ` : ''}{new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {doc.viewUrl && (
                      <a
                        href={doc.viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#12A5A9] text-xs font-semibold hover:underline"
                      >
                        {t('viewArrow', lang)}
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(doc)}
                      className="text-red-400/70 text-xs hover:text-red-400 transition"
                    >
                      {t('delete', lang)}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </ScrollReveal>
        )}
        </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
