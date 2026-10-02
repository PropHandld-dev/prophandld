'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { FileTextIcon } from '@/components/icons'
import { RENTER_TABS } from '@/lib/navTabs'
import { useLanguage, t } from '@/lib/i18n'
import { validateDocumentFile } from '@/lib/mediaValidation'

const TENANT_DOCUMENT_TYPES = ['Renters Insurance', 'Utility Proof: Electric', 'Utility Proof: Gas', 'Utility Proof: Water', 'Other']

export default function RenterDocumentsPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    document_type: '',
    custom_document_type: '',
    // Landlord-only by default — this is the tenant's own paperwork (a
    // utility bill can show an account number), so the safer default is
    // "just the landlord and me," not automatically visible to a roommate
    // on the same unit. Still their choice to widen it.
    visibility: 'landlord_only',
    expiry_date: '',
  })
  const [files, setFiles] = useState<File[]>([])

  const loadDocuments = async (forPropertyId: string) => {
    const { data: documentsData, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .eq('property_id', forPropertyId)
      .order('created_at', { ascending: false })

    if (documentsError) {
      console.error('Error loading documents:', documentsError)
      return
    }

    if (!documentsData || documentsData.length === 0) {
      setDocuments([])
      return
    }

    const enriched = await Promise.all(
      documentsData.map(async (doc) => {
        const { data: signedUrlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_url, 3600)
        return { ...doc, viewUrl: signedUrlData?.signedUrl }
      })
    )

    setDocuments(enriched)
  }

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
      const { data: tenancyData } = tenancyId
        ? await supabase.from('tenancies').select('unit_id').eq('id', tenancyId).maybeSingle()
        : { data: null }

      if (!tenancyData) {
        setLoading(false)
        return
      }
      setUnitId(tenancyData.unit_id)

      const { data: unitData } = await supabase
        .from('units')
        .select('property_id')
        .eq('id', tenancyData.unit_id)
        .maybeSingle()

      if (!unitData) {
        setLoading(false)
        return
      }
      setPropertyId(unitData.property_id)

      await loadDocuments(unitData.property_id)
      setLoading(false)
    }
    init()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const incoming = Array.from(e.target.files)
      for (const file of incoming) {
        const validationError = validateDocumentFile(file)
        if (validationError) {
          setError(validationError)
          e.target.value = ''
          return
        }
      }
      setError(null)
      setFiles([...files, ...incoming])
    }
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.document_type) {
      setError(t('pleaseSelectDocumentType', lang))
      return
    }
    if (form.document_type === 'Other' && !form.custom_document_type.trim()) {
      setError(t('pleaseEnterDocumentType', lang))
      return
    }
    if (files.length === 0) {
      setError(t('pleaseChooseOneFile', lang))
      return
    }
    for (const file of files) {
      const validationError = validateDocumentFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
    }
    if (!userId || !propertyId || !unitId) return

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
        setError(t('filesFailedToUpload', lang))
        continue
      }

      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          property_id: propertyId,
          unit_id: unitId,
          uploaded_by: userId,
          uploaded_by_role: 'renter',
          document_type: documentType,
          filename: file.name,
          file_url: filePath,
          visibility: form.visibility,
          expiry_date: form.document_type === 'Renters Insurance' && form.expiry_date ? form.expiry_date : null,
        })

      if (insertError) {
        console.error('Error saving document record:', insertError)
        setError(t('filesFailedToSave', lang))
      }
    }

    setFiles([])
    setForm({ document_type: '', custom_document_type: '', visibility: 'landlord_only', expiry_date: '' })
    await loadDocuments(propertyId)
    setUploading(false)
  }

  const handleDelete = async (doc: any) => {
    if (!window.confirm(`${t('removeAttachmentConfirmPrefix', lang)}${doc.filename}${t('removeAttachmentConfirmSuffix', lang)}`)) return

    const { error: storageError } = await supabase.storage.from('documents').remove([doc.file_url])
    if (storageError) {
      console.error('Error deleting document file:', storageError)
    }

    const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id)
    if (deleteError) {
      console.error('Error deleting document record:', deleteError)
      setError(t('couldNotDeleteDocument', lang))
      return
    }

    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <div className="mb-8">
              <Skeleton className="h-7 w-40 mb-2" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
        <>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{t('documentsTitle', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">{t('renterDocumentsSubtitle', lang)}</p>
        </div>

        {!unitId ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('noUnitLinked', lang)}</p>
          </div>
        ) : (
        <>
        <ScrollReveal>
        <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold mb-2">{t('uploadADocument', lang)}</h2>
          <p className="text-white/50 text-xs -mt-2 mb-2">{t('uploadADocumentRenterDesc', lang)}</p>

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('typeLabel', lang)}</label>
            <select
              name="document_type"
              value={form.document_type}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">{t('selectAType', lang)}</option>
              {TENANT_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type} className="bg-[#0C1A2E]">{type}</option>
              ))}
            </select>
            {form.document_type === 'Other' && (
              <input
                type="text"
                name="custom_document_type"
                value={form.custom_document_type}
                onChange={(e) => setForm({ ...form, custom_document_type: e.target.value })}
                placeholder={t('enterDocumentType', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition mt-2"
              />
            )}
          </div>

          {form.document_type === 'Renters Insurance' && (
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('policyExpiresOptional', lang)}</label>
              <input
                type="date"
                name="expiry_date"
                value={form.expiry_date}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              />
              <p className="text-white/40 text-xs mt-1">{t('policyExpiresHelp', lang)}</p>
            </div>
          )}

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('whoCanSeeThis', lang)}</label>
            <select
              name="visibility"
              value={form.visibility}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="landlord_only" className="bg-[#0C1A2E]">{t('justMyLandlordAndMe', lang)}</option>
              <option value="shared" className="bg-[#0C1A2E]">{t('myLandlordAndOthers', lang)}</option>
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

        <h2 className="text-white font-semibold mb-4">
          {t('allDocuments', lang)} {documents.length > 0 && `(${documents.length})`}
        </h2>

        {documents.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('noDocumentsAvailableYet', lang)}</p>
          </div>
        ) : (
          <ScrollReveal className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex items-start gap-3">
                    <FileTextIcon className="w-4 h-4 text-white/60 shrink-0 mt-1" />
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate">{doc.filename}</h3>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {doc.document_type && (
                          <span className="text-xs bg-[#12A5A9]/15 text-[#12A5A9] rounded-full px-2.5 py-0.5">
                            {doc.document_type}
                          </span>
                        )}
                        {doc.uploaded_by === userId && (
                          <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                            {t('uploadedByYou', lang)}
                          </span>
                        )}
                        {doc.expiry_date && (
                          <span className={`text-xs rounded-full px-2.5 py-0.5 ${new Date(doc.expiry_date + 'T00:00:00') < new Date() ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                            {t('expiresLabel', lang)} {new Date(doc.expiry_date + 'T00:00:00').toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-white/50 text-xs mt-2">
                        {new Date(doc.created_at).toLocaleDateString()}
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
                    {doc.uploaded_by === userId && (
                      <button
                        onClick={() => handleDelete(doc)}
                        className="text-red-400/70 text-xs hover:text-red-400 transition"
                      >
                        {t('delete', lang)}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </ScrollReveal>
        )}
        </>
        )}
        </>
        )}
      </main>

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}
