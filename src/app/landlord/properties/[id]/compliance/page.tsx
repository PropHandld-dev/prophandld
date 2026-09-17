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

const ITEM_TYPES = [
  'Rental License',
  'Lead Certification',
  'Smoke Detector Inspection',
  'CO Detector Inspection',
  'Fire Extinguisher Inspection',
  'Insurance Renewal',
  'Other',
]

export default function PropertyCompliancePage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [property, setProperty] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [itemDocuments, setItemDocuments] = useState<Record<string, any>>({})
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    item_type: '',
    custom_item_type: '',
    expiry_date: '',
    reminder_days: '30',
  })
  const [file, setFile] = useState<File | null>(null)

  const [renewingId, setRenewingId] = useState<string | null>(null)
  const [renewDate, setRenewDate] = useState('')
  const [attachingId, setAttachingId] = useState<string | null>(null)

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

      await loadItems()
      setLoading(false)
    }
    init()
  }, [propertyId, router])

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

    const ext = docFile.name.split('.').pop()
    const filePath = `${propertyId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, docFile)

    if (uploadError) {
      console.error('Error uploading compliance document:', uploadError)
      setError(`Could not upload document: ${uploadError.message}`)
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
      setError(`Document uploaded, but could not link it: ${docInsertError.message}`)
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
    if (!window.confirm(`Remove "${doc.filename}"?`)) return

    const { error: storageError } = await supabase.storage.from('documents').remove([doc.file_url])
    if (storageError) {
      console.error('Error deleting document file:', storageError)
    }

    const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id)
    if (deleteError) {
      console.error('Error deleting document record:', deleteError)
      setError(`Could not remove document: ${deleteError.message}`)
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
      setError('Please select a type.')
      return
    }
    if (form.item_type === 'Other' && !form.custom_item_type.trim()) {
      setError('Please enter a type.')
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
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error adding compliance item:', insertError)
      setError(`Could not add item: ${insertError.message}`)
      setSaving(false)
      return
    }

    if (file && newItem) {
      await uploadComplianceDocument(newItem.id, itemType, file)
    }

    setForm({ item_type: '', custom_item_type: '', expiry_date: '', reminder_days: '30' })
    setFile(null)
    await loadItems()
    setSaving(false)
  }

  const startRenew = (item: any) => {
    setRenewingId(item.id)
    setRenewDate(item.expiry_date || '')
    setError(null)
  }

  const cancelRenew = () => {
    setRenewingId(null)
    setRenewDate('')
  }

  const saveRenew = async (itemId: string) => {
    if (!renewDate) {
      setError('Please pick a new expiry date.')
      return
    }

    const { error: updateError } = await supabase
      .from('compliance_items')
      .update({ expiry_date: renewDate })
      .eq('id', itemId)

    if (updateError) {
      console.error('Error renewing item:', updateError)
      setError(`Could not save changes: ${updateError.message}`)
      return
    }

    setRenewingId(null)
    setRenewDate('')
    await loadItems()
  }

  const handleDelete = async (item: any) => {
    if (!window.confirm(`Remove "${item.item_type}"?`)) return

    const { error: deleteError } = await supabase.from('compliance_items').delete().eq('id', item.id)
    if (deleteError) {
      console.error('Error deleting compliance item:', deleteError)
      setError(`Could not delete item: ${deleteError.message}`)
      return
    }

    setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  const getExpiryStatus = (item: any) => {
    if (!item.expiry_date) {
      return { label: 'No expiry set', color: 'bg-white/8 text-white/50' }
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiry = new Date(item.expiry_date + 'T00:00:00')
    const daysUntil = Math.round((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    const reminderDays = item.reminder_days ?? 30

    if (daysUntil < 0) return { label: 'Expired', color: 'bg-red-500/15 text-red-400' }
    if (daysUntil <= reminderDays) return { label: 'Expiring soon', color: 'bg-yellow-500/15 text-yellow-400' }
    return { label: 'Current', color: 'bg-[#12A5A9]/15 text-[#12A5A9]' }
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
          <h1 className="text-2xl font-bold text-white">Compliance</h1>
          <p className="text-white/50 text-sm mt-1">{property.address}</p>
        </div>

        <ScrollReveal>
        <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold mb-2">Track an item</h2>

          <div>
            <label className="text-white/70 text-sm block mb-1">Type</label>
            <select
              name="item_type"
              value={form.item_type}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" className="bg-[#0C1A2E]">Select a type</option>
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type} className="bg-[#0C1A2E]">{type}</option>
              ))}
            </select>
            {form.item_type === 'Other' && (
              <input
                type="text"
                name="custom_item_type"
                value={form.custom_item_type}
                onChange={handleChange}
                placeholder="Enter a type"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition mt-2"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Expiry date</label>
              <input
                type="date"
                name="expiry_date"
                value={form.expiry_date}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Remind me (days before)</label>
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
            <label className="text-white/70 text-sm block mb-1">Attach document (optional)</label>
            <label className="block">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                {file ? file.name : '+ Choose file'}
              </span>
            </label>
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
            {saving ? 'Adding...' : 'Add item'}
          </RippleButton>
        </form>
        </ScrollReveal>

        <h2 className="text-white font-semibold mb-4">
          All items {items.length > 0 && `(${items.length})`}
        </h2>

        {items.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No compliance items tracked yet.</p>
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
                      <h3 className="text-white font-semibold truncate">{item.item_type}</h3>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-0.5 ${status.color}`}>
                          {status.label === 'Expired' && <AlertTriangleIcon className="w-3 h-3" />}
                          {status.label === 'Current' && <CheckCircleIcon className="w-3 h-3" />}
                          {status.label}
                        </span>
                        {item.expiry_date && (
                          <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                            Expires {new Date(item.expiry_date + 'T00:00:00').toLocaleDateString()}
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
                          Renew
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-red-400/70 text-xs hover:text-red-400 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {isRenewing && (
                    <div className="flex items-center gap-2 mt-4">
                      <input
                        type="date"
                        value={renewDate}
                        onChange={(e) => setRenewDate(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                      />
                      <button
                        onClick={() => saveRenew(item.id)}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelRenew}
                        className="text-white/50 hover:text-white text-xs px-2 transition"
                      >
                        Cancel
                      </button>
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
                            View attached document →
                          </a>
                        )}
                        <button
                          onClick={() => handleRemoveAttachment(itemDocuments[item.id])}
                          className="text-red-400/70 text-xs hover:text-red-400 transition ml-auto"
                        >
                          Remove
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
                            if (selected) handleAttachToItem(item, selected)
                            e.target.value = ''
                          }}
                        />
                        <span className="text-[#12A5A9] text-xs font-semibold hover:underline">
                          {attachingId === item.id ? 'Uploading...' : '+ Attach document'}
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
    </div>
  )
}
