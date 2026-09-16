'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { BuildingIcon, UserIcon, FileTextIcon, ClipboardListIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { MagneticLink } from '@/components/MagneticLink'
import { CountUp } from '@/components/CountUp'

export default function PropertyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const [property, setProperty] = useState<any>(null)
  const [units, setUnits] = useState<any[]>([])
  const [occupiedUnitIds, setOccupiedUnitIds] = useState<Set<string>>(new Set())
  const [contacts, setContacts] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [complianceItems, setComplianceItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingUnit, setSavingUnit] = useState(false)
  const [unitError, setUnitError] = useState<string | null>(null)

  const fetchProperty = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

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

      if (unitsData) {
        setUnits(unitsData)

        const unitIds = unitsData.map((u) => u.id)
        if (unitIds.length > 0) {
          const { data: tenanciesData, error: tenanciesError } = await supabase
            .from('tenancies')
            .select('unit_id')
            .in('unit_id', unitIds)
            .eq('ended', false)

          if (tenanciesError) {
            console.error('Error fetching tenancies:', tenanciesError)
          }

          if (tenanciesData) {
            setOccupiedUnitIds(new Set(tenanciesData.map((t) => t.unit_id)))
          }
        } else {
          setOccupiedUnitIds(new Set())
        }
      }

      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })

      if (contactsError) {
        console.error('Error fetching contacts:', contactsError)
      } else if (contactsData) {
        setContacts(contactsData)
      }

      const { data: documentsData, error: documentsError } = await supabase
        .from('documents')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })

      if (documentsError) {
        console.error('Error fetching documents:', documentsError)
      } else if (documentsData) {
        setDocuments(documentsData)
      }

      const { data: complianceData, error: complianceError } = await supabase
        .from('compliance_items')
        .select('*')
        .eq('property_id', propertyId)
        .order('expiry_date', { ascending: true, nullsFirst: false })

      if (complianceError) {
        console.error('Error fetching compliance items:', complianceError)
      } else if (complianceData) {
        setComplianceItems(complianceData)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProperty()
  }, [propertyId, router])

  const startEditing = (unit: any) => {
    setEditingUnitId(unit.id)
    setEditValue(unit.unit_number)
    setUnitError(null)
  }

  const cancelEditing = () => {
    setEditingUnitId(null)
    setEditValue('')
    setUnitError(null)
  }

  const saveUnitEdit = async (unitId: string) => {
    if (!editValue.trim()) {
      setUnitError('Unit number cannot be empty.')
      return
    }

    setSavingUnit(true)
    setUnitError(null)

    const { error: updateError } = await supabase
      .from('units')
      .update({ unit_number: editValue.trim() })
      .eq('id', unitId)

    if (updateError) {
      console.error('Error updating unit:', updateError)
      setUnitError('Could not save changes.')
      setSavingUnit(false)
      return
    }

    setEditingUnitId(null)
    setEditValue('')
    setSavingUnit(false)
    await fetchProperty()
  }

  const removeUnit = async (unitId: string, isOccupied: boolean) => {
    if (isOccupied) {
      setUnitError('This unit has an active tenancy. End the tenancy before removing it.')
      return
    }

    const confirmed = window.confirm('Remove this unit? This cannot be undone.')
    if (!confirmed) return

    const { error: deleteError } = await supabase
      .from('units')
      .delete()
      .eq('id', unitId)

    if (deleteError) {
      console.error('Error deleting unit:', deleteError)
      setUnitError('Could not remove unit: ' + deleteError.message)
      return
    }

    await fetchProperty()
  }

  const occupiedCount = occupiedUnitIds.size
  const vacantCount = units.length - occupiedCount

  const getComplianceStatus = (item: any) => {
    if (!item.expiry_date) return { label: 'No expiry set', color: 'bg-white/8 text-white/50' }
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
        <Link href="/landlord/properties" className="text-white/50 hover:text-white text-sm transition">
          ← Properties
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <MagneticLink
          href={`/landlord/properties/${propertyId}/units/new`}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition"
        >
          + Add unit
        </MagneticLink>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10 pb-28">

        {loading || !property ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <Skeleton className="h-7 w-56 mb-2" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
            <Skeleton className="h-5 w-24" />
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
          </div>
        ) : (
        <>
        {/* Property header */}
        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0A7B7E]/20 flex items-center justify-center shrink-0 mt-0.5">
              <BuildingIcon className="w-5 h-5 text-[#12A5A9]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{property.address}</h1>
              <p className="text-white/50 mt-1">{property.city}, {property.state} {property.zip}</p>
              <span className="text-xs bg-white/8 text-white/60 rounded-full px-3 py-1 capitalize inline-block mt-2">
                {property.property_type}
              </span>
            </div>
          </div>
          <Link
            href={`/landlord/properties/${propertyId}/edit`}
            className="text-[#12A5A9] text-sm hover:underline"
          >
            Edit
          </Link>
        </div>

        {/* Stats */}
        <ScrollReveal>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:-translate-y-0.5 transition-all">
            <CountUp value={units.length} className="text-2xl font-bold text-white" />
            <div className="text-white/40 text-xs mt-1">Total units</div>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:-translate-y-0.5 transition-all">
            <CountUp value={occupiedCount} className="text-2xl font-bold text-white" />
            <div className="text-white/40 text-xs mt-1">Occupied</div>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:-translate-y-0.5 transition-all">
            <CountUp value={vacantCount} className="text-2xl font-bold text-white" />
            <div className="text-white/40 text-xs mt-1">Vacant</div>
          </div>
        </div>
        </ScrollReveal>

        {/* Units */}
        {/* Units */}
<div className="mb-4">
  <h2 className="text-white font-semibold">Units</h2>
  <p className="text-white/40 text-sm mt-1">
    Click a unit to add a tenant, start an inspection, or view details. Use "Rename" just to change the unit's label.
  </p>
</div>

        {unitError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
            {unitError}
          </div>
        )}

        {units.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/40 text-sm">No units yet.</p>
            <Link
              href={`/landlord/properties/${propertyId}/units/new`}
              className="text-[#12A5A9] text-sm hover:underline block mt-2"
            >
              Add a unit
            </Link>
          </div>
        ) : (
          <ScrollReveal>
          <div className="grid gap-3">
            {units.map((unit) => {
              const isOccupied = occupiedUnitIds.has(unit.id)
              const isEditing = editingUnitId === unit.id

              return (
                <div
                  key={unit.id}
                  className={
                    isEditing
                      ? 'bg-white/3 border border-white/8 rounded-2xl p-5'
                      : 'bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all'
                  }
                >
                  <div className="flex items-center justify-between gap-4">
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                          autoFocus
                        />
                        <button
                          onClick={() => saveUnitEdit(unit.id)}
                          disabled={savingUnit}
                          className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="text-white/40 text-xs hover:text-white transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <Link
                        href={`/landlord/properties/${propertyId}/units/${unit.id}`}
                        className="flex-1"
                      >
                        <h3 className="text-white font-semibold">{unit.unit_number}</h3>
                        <p className="text-white/30 text-sm mt-1">{isOccupied ? 'Occupied' : 'Vacant'}</p>
                        {unit.sqft && <p className="text-white/30 text-xs mt-1">{unit.sqft} sqft</p>}
                      </Link>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            isOccupied
                              ? 'text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5'
                              : 'text-xs bg-white/5 text-white/30 border border-white/10 rounded-full px-2 py-0.5'
                          }
                        >
                          {isOccupied ? 'Occupied' : 'Vacant'}
                        </span>
                        <button
  onClick={() => startEditing(unit)}
  className="text-white/40 hover:text-white text-xs transition"
>
  Rename
</button>
                        <button
                          onClick={() => removeUnit(unit.id, isOccupied)}
                          className="text-red-400/70 hover:text-red-400 text-xs transition"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </ScrollReveal>
        )}

        {/* Emergency contacts */}
        <ScrollReveal className="mt-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-white/40" />
              Emergency contacts
            </h2>
            <Link
              href={`/landlord/properties/${propertyId}/contacts`}
              className="text-[#12A5A9] text-sm hover:underline"
            >
              Manage
            </Link>
          </div>
          {contacts.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-white/30 text-sm">No emergency contacts added yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.slice(0, 3).map((contact) => (
                <div key={contact.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{contact.name}</p>
                    <p className="text-white/40 text-xs mt-0.5">{contact.role}{contact.phone ? ` · ${contact.phone}` : ''}</p>
                  </div>
                </div>
              ))}
              {contacts.length > 3 && (
                <p className="text-white/30 text-xs px-1">+{contacts.length - 3} more</p>
              )}
            </div>
          )}
        </div>
        </ScrollReveal>

        {/* Documents */}
        <ScrollReveal className="mt-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <FileTextIcon className="w-4 h-4 text-white/40" />
              Documents
            </h2>
            <Link
              href={`/landlord/properties/${propertyId}/documents`}
              className="text-[#12A5A9] text-sm hover:underline"
            >
              Manage
            </Link>
          </div>
          {documents.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-white/30 text-sm">Leases, deeds, insurance, and inspection reports for this property.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.slice(0, 3).map((doc) => (
                <div key={doc.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-white text-sm font-medium truncate">{doc.filename}</p>
                  {doc.document_type && (
                    <span className="text-xs bg-[#12A5A9]/15 text-[#12A5A9] rounded-full px-2.5 py-0.5 shrink-0">
                      {doc.document_type}
                    </span>
                  )}
                </div>
              ))}
              {documents.length > 3 && (
                <p className="text-white/30 text-xs px-1">+{documents.length - 3} more</p>
              )}
            </div>
          )}
        </div>
        </ScrollReveal>

        {/* Compliance */}
        <ScrollReveal className="mt-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <ClipboardListIcon className="w-4 h-4 text-white/40" />
              Compliance
            </h2>
            <Link
              href={`/landlord/properties/${propertyId}/compliance`}
              className="text-[#12A5A9] text-sm hover:underline"
            >
              Manage
            </Link>
          </div>
          {complianceItems.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-white/30 text-sm">Rental license, lead certification, and inspection expiry tracking.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {complianceItems.slice(0, 3).map((item) => {
                const status = getComplianceStatus(item)
                return (
                  <div key={item.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-white text-sm font-medium truncate">{item.item_type}</p>
                    <span className={`text-xs rounded-full px-2.5 py-0.5 shrink-0 ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                )
              })}
              {complianceItems.length > 3 && (
                <p className="text-white/30 text-xs px-1">+{complianceItems.length - 3} more</p>
              )}
            </div>
          )}
        </div>
        </ScrollReveal>
        </>
        )}

      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}