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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProperty = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: propertyData } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .eq('owner_user_id', user.id)
        .single()

      if (!propertyData) {
        router.push('/landlord/properties')
        return
      }

      setProperty(propertyData)

      const { data: unitsData } = await supabase
        .from('units')
        .select(`
          *,
          tenancies (
            id,
            rent_amount,
            lease_start,
            lease_end,
            users (full_name, email, phone)
          )
        `)
        .eq('property_id', propertyId)
        .order('unit_number')

      if (unitsData) setUnits(unitsData)
      setLoading(false)
    }
    fetchProperty()
  }, [propertyId, router])

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  if (!property) return null

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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{property.address}</h1>
          <p className="text-white/50 mt-1">{property.city}, {property.state} {property.zip}</p>
          <span className="text-xs bg-white/8 text-white/60 rounded-full px-3 py-1 capitalize inline-block mt-2">{property.property_type}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total units', value: units.length },
            { label: 'Occupied', value: units.filter(u => u.tenancies?.length > 0).length },
            { label: 'Vacant', value: units.filter(u => !u.tenancies?.length).length },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-white/40 text-xs mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Units */}
        <h2 className="text-white font-semibold mb-4">Units</h2>
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
              const tenancy = unit.tenancies?.[0]
              const tenant = tenancy?.users
              return (
                <Link
                  key={unit.id}
                  href={`/landlord/properties/${propertyId}/units/${unit.id}`}
                  className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 transition block"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">{unit.unit_number}</h3>
                      {tenant ? (
                        <p className="text-white/50 text-sm mt-1">🧑 {tenant.full_name}</p>
                      ) : (
                        <p className="text-white/30 text-sm mt-1">Vacant</p>
                      )}
                      {unit.sqft && <p className="text-white/30 text-xs mt-1">{unit.sqft} sqft</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      {tenancy ? (
                        <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5">Occupied</span>
                      ) : (
                        <span className="text-xs bg-white/5 text-white/30 border border-white/10 rounded-full px-2 py-0.5">Vacant</span>
                      )}
                      <span className="text-white/30">→</span>
                    </div>
                  </div>
                </Link>
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