'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function UnitDetailPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string
  const [unit, setUnit] = useState<any>(null)
  const [tenancy, setTenancy] = useState<any>(null)
  const [tenantLookupFailed, setTenantLookupFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showMoveOutForm, setShowMoveOutForm] = useState(false)
  const [moveOutDate, setMoveOutDate] = useState('')
  const [savingMoveOut, setSavingMoveOut] = useState(false)
  const [moveOutError, setMoveOutError] = useState<string | null>(null)

  const fetchUnit = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: unitData } = await supabase
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single()

    if (!unitData) {
      router.push(`/landlord/properties/${propertyId}`)
      return
    }

    setUnit(unitData)

    // Only show active (not-yet-ended) tenancies
    const { data: tenancyData } = await supabase
      .from('tenancies')
      .select('*')
      .eq('unit_id', unitId)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (tenancyData) {
      const { data: renterData, error: renterError } = await supabase
        .rpc('get_user_by_id', { user_id_input: tenancyData.renter_user_id })
        .maybeSingle()

      if (renterError) {
        console.error('Error fetching renter:', renterError)
        setTenantLookupFailed(true)
      }

      setTenancy({ ...tenancyData, users: renterData })
    } else {
      setTenancy(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchUnit()
  }, [unitId, propertyId, router])

  const handleStartEndTenancy = () => {
    setShowMoveOutForm(true)
    setMoveOutError(null)
  }

  const handleConfirmMoveOutDate = async () => {
    if (!moveOutDate) {
      setMoveOutError('Please select a move-out date.')
      return
    }

    setSavingMoveOut(true)
    setMoveOutError(null)

    const { error: updateError } = await supabase
      .from('tenancies')
      .update({ move_out_date: moveOutDate })
      .eq('id', tenancy.id)

    if (updateError) {
      console.error('Error setting move-out date:', updateError)
      setMoveOutError('Could not set move-out date.')
      setSavingMoveOut(false)
      return
    }

    // Auto-create the move-out inspection, same pattern as move-in
    const { error: insertError } = await supabase
      .from('move_in_inspections')
      .insert({ tenancy_id: tenancy.id, unit_id: unitId, status: 'in_progress', type: 'move_out' })

    if (insertError) {
      console.error('Error creating move-out inspection:', insertError)
      // Not fatal — inspection can still be started manually from the inspection page
    }

    router.push(`/landlord/properties/${propertyId}/units/${unitId}/inspection?type=move_out`)
  }

  const handleConfirmMoveOutComplete = async () => {
    const confirmed = window.confirm(
      'Confirm this tenant has fully moved out? This will mark the unit as vacant.'
    )
    if (!confirmed) return

    const { error: updateError } = await supabase
      .from('tenancies')
      .update({ ended: true })
      .eq('id', tenancy.id)

    if (updateError) {
      console.error('Error ending tenancy:', updateError)
      setMoveOutError('Could not end tenancy: ' + updateError.message)
      return
    }

    await fetchUnit()
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  if (!unit) return null

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

      <main className="max-w-2xl mx-auto px-6 py-10">

        {/* Unit header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{unit.unit_number}</h1>
          {unit.floor && <p className="text-white/50 text-sm mt-1">Floor {unit.floor}</p>}
          {unit.sqft && <p className="text-white/50 text-sm">{unit.sqft} sqft</p>}
        </div>

        {/* Tenant section */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Tenant</h2>
            {!tenancy && (
              <Link
                href={`/landlord/properties/${propertyId}/units/${unitId}/tenancy/new`}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition"
              >
                + Link renter
              </Link>
            )}
          </div>

          {tenancy && tenantLookupFailed ? (
            <p className="text-yellow-400/70 text-sm">
              Tenant linked, but details are unavailable right now.
            </p>
          ) : tenancy ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0A7B7E]/20 rounded-full flex items-center justify-center text-[#12A5A9] font-semibold">
                  {tenancy.users?.full_name?.[0] || '?'}
                </div>
                <div>
                  <p className="text-white font-medium">{tenancy.users?.full_name}</p>
                  <p className="text-white/50 text-sm">{tenancy.users?.email}</p>
                </div>
              </div>
              {tenancy.users?.phone && (
                <p className="text-white/40 text-sm">📞 {tenancy.users.phone}</p>
              )}
              {tenancy.rent_amount && (
                <p className="text-white/40 text-sm">💰 ${tenancy.rent_amount}/month</p>
              )}
              {tenancy.lease_start && (
                <p className="text-white/40 text-sm">
                  📅 {new Date(tenancy.lease_start).toLocaleDateString()} 
                  {tenancy.lease_end ? ` → ${new Date(tenancy.lease_end).toLocaleDateString()}` : ' → ongoing'}
                </p>
              )}

              {tenancy.move_out_date && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mt-2">
                  <p className="text-yellow-400/80 text-sm">
                    🚪 Move-out scheduled for {new Date(tenancy.move_out_date).toLocaleDateString()}
                  </p>
                </div>
              )}

              {moveOutError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {moveOutError}
                </div>
              )}

              {showMoveOutForm ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2 space-y-3">
                  <label className="text-white/70 text-sm block">Move-out date</label>
                  <input
                    type="date"
                    value={moveOutDate}
                    onChange={(e) => setMoveOutDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleConfirmMoveOutDate}
                      disabled={savingMoveOut}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      {savingMoveOut ? 'Saving...' : 'Confirm & start move-out inspection'}
                    </button>
                    <button
                      onClick={() => setShowMoveOutForm(false)}
                      className="text-white/40 text-xs hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 mt-2">
                  <Link
                    href={`/landlord/properties/${propertyId}/units/${unitId}/inspection`}
                    className="text-[#12A5A9] text-xs hover:underline"
                  >
                    Move-in inspection
                  </Link>
                  {tenancy.move_out_date && (
                    <Link
                      href={`/landlord/properties/${propertyId}/units/${unitId}/inspection?type=move_out`}
                      className="text-[#12A5A9] text-xs hover:underline"
                    >
                      Move-out inspection
                    </Link>
                  )}
                  {!tenancy.move_out_date ? (
                    <button
                      onClick={handleStartEndTenancy}
                      className="text-red-400/70 text-xs hover:text-red-400 transition"
                    >
                      End tenancy
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirmMoveOutComplete}
                      className="text-red-400/70 text-xs hover:text-red-400 transition"
                    >
                      Confirm move-out complete
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-white/30 text-sm">No tenant linked — unit is vacant.</p>
          )}
        </div>

        {/* Open jobs */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <h2 className="text-white font-semibold mb-4">Open jobs</h2>
          <p className="text-white/30 text-sm">No open jobs for this unit.</p>
        </div>

        {/* Job history */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <h2 className="text-white font-semibold mb-4">Job history</h2>
          <p className="text-white/30 text-sm">No completed jobs yet.</p>
        </div>

        {/* Maintenance tab */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Maintenance items</h2>
          <p className="text-white/30 text-sm">Maintenance tracking coming in V2.</p>
        </div>

      </main>
    </div>
  )
}