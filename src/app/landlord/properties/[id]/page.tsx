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
  const [renter, setRenter] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUnit = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch unit
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

      // Fetch tenancy separately
      const { data: tenancyData } = await supabase
        .from('tenancies')
        .select('*')
        .eq('unit_id', unitId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (tenancyData) {
        setTenancy(tenancyData)

        // Fetch renter info separately using RPC
        const { data: renterData } = await supabase
          .from('users')
          .select('full_name, email, phone')
          .eq('id', tenancyData.renter_user_id)
          .maybeSingle()

        if (renterData) setRenter(renterData)
      }

      setLoading(false)
    }
    fetchUnit()
  }, [unitId, propertyId, router])

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

          {tenancy && renter ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0A7B7E]/20 rounded-full flex items-center justify-center text-[#12A5A9] font-semibold text-lg">
                  {renter.full_name?.[0] || '?'}
                </div>
                <div>
                  <p className="text-white font-medium">{renter.full_name}</p>
                  <p className="text-white/50 text-sm">{renter.email}</p>
                </div>
              </div>
              {renter.phone && (
                <p className="text-white/40 text-sm">📞 {renter.phone}</p>
              )}
              {tenancy.rent_amount && (
                <p className="text-white/40 text-sm">💰 ${tenancy.rent_amount}/month</p>
              )}
              {tenancy.security_deposit && (
                <p className="text-white/40 text-sm">🔒 ${tenancy.security_deposit} deposit</p>
              )}
              {tenancy.lease_start && (
                <p className="text-white/40 text-sm">
                  📅 {new Date(tenancy.lease_start).toLocaleDateString()}
                  {tenancy.lease_end ? ` → ${new Date(tenancy.lease_end).toLocaleDateString()}` : ' → ongoing'}
                </p>
              )}
              <button className="text-red-400/70 text-xs hover:text-red-400 transition mt-2">
                End tenancy
              </button>
            </div>
          ) : tenancy && !renter ? (
            <p className="text-white/30 text-sm">Tenant linked — loading details...</p>
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

        {/* Maintenance */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Maintenance items</h2>
          <p className="text-white/30 text-sm">Maintenance tracking coming in V2.</p>
        </div>

      </main>
    </div>
  )
}