'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function PropertyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const [property, setProperty] = useState<any>(null)
  const [units, setUnits] = useState<any[]>([])
  const [occupiedUnitIds, setOccupiedUnitIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingUnit, setSavingUnit] = useState(false)
  const [unitError, setUnitError] = useState<string | null>(null)

  const fetchProperty = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
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

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  if (!property) return null

  const occupiedCount = occupiedUnitIds.size
  const vacantCount = units.length - occupiedCount

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord/properties" className="text-white/50 hover:text-white text-sm transition">
          ← Properties
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <Link
          href={`/landlord/properties/${propertyId}/units/new`}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition"
        >
          + Add unit
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* Property header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{property.address}</h1>
            <p className="text-white/50 mt-1">{property.city}, {property.state} {property.zip}</p>
            <span className="text-xs bg-white/8 text-white/60 rounded-full px-3 py-1 capitalize inline-block mt-2">
              {property.property_type}
            </span>
          </div>
          <Link
            href={`/landlord/properties/${propertyId}/edit`}
            className="text-[#12A5A9] text-sm hover:underline"
          >
            Edit
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{units.length}</div>
            <div className="text-white/40 text-xs mt-1">Total units</div>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{occupiedCount}</div>
            <div className="text-white/40 text-xs mt-1">Occupied</div>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{vacantCount}</div>
            <div className="text-white/40 text-xs mt-1">Vacant</div>
          </div>
        </div>

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
          <div className="grid gap-3">
            {units.map((unit) => {
              const isOccupied = occupiedUnitIds.has(unit.id)
              const isEditing = editingUnitId === unit.id

              return (
                <div
                  key={unit.id}
                  className="bg-white/3 border border-white/8 rounded-2xl p-5"
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
                        className="flex-1 hover:opacity-80 transition"
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
        )}

        {/* Emergency contacts */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Emergency contacts</h2>
            <Link
              href={`/landlord/properties/${propertyId}/contacts`}
              className="text-[#12A5A9] text-sm hover:underline"
            >
              Manage
            </Link>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <p className="text-white/30 text-sm">No emergency contacts added yet.</p>
          </div>
        </div>

      </main>
    </div>
  )
}