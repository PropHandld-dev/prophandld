'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { FileTextIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'

const DOCUMENT_TYPES = ['Lease', 'Rental Agreement', 'Deed', 'Insurance', 'Inspection Report', 'Other']

export default function PropertyDocumentsPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [property, setProperty] = useState<any>(null)
  const [units, setUnits] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    document_type: '',
    custom_document_type: '',
    unit_id: '',
  })
  const [files, setFiles] = useState<File[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
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
        router.push('/landlord/properties')
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
          document_type: documentType,
          filename: file.name,
          file_url: filePath,
        })

      if (insertError) {
        console.error('Error saving document record:', insertError)
        setError('One or more files failed to save.')
      }
    }

    setFiles([])
    setForm({ document_type: '', custom_document_type: '', unit_id: '' })
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

  const getUnitLabel = (unitId: string | null) => {
    if (!unitId) return 'Property-wide'
    const unit = units.find((u) => u.id === unitId)
    return unit ? unit.unit_number : 'Unknown unit'
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Property
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
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
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-white/50 text-sm mt-1">{property.address}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold mb-2">Upload a document</h2>

          <div>
            <label className="text-white/70 text-sm block mb-1">Type</label>
            <select
              name="document_type"
              value={form.document_type}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">Select a type</option>
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
                placeholder="Enter a document type"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition mt-2"
              />
            )}
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Applies to</label>
            <select
              name="unit_id"
              value={form.unit_id}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">Property-wide</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id} className="bg-[#0C1A2E]">
                  {unit.unit_number} only
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Files</label>
            <label className="block">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                {files.length > 0 ? '+ Add more files' : '+ Choose files'}
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
                      Remove
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

          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>

        <h2 className="text-white font-semibold mb-4">
          All documents {documents.length > 0 && `(${documents.length})`}
        </h2>

        {documents.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex items-start gap-3">
                    <FileTextIcon className="w-4 h-4 text-white/40 shrink-0 mt-1" />
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate">{doc.filename}</h3>
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
                            Compliance
                          </span>
                        )}
                      </div>
                      <p className="text-white/30 text-xs mt-2">
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
                        View →
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(doc)}
                      className="text-red-400/70 text-xs hover:text-red-400 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
