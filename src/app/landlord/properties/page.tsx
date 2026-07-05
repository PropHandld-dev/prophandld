'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function PropertiesPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  const fetchProperties = async (includeArchived: boolean) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    let query = supabase
      .from('properties')
      .select('*')
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })

    if (!includeArchived) {
      query = query.eq('archived', false)
    }

    const { data } = await query
    if (data) setProperties(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchProperties(showArchived)
  }, [showArchived])

  const handleArchiveToggle = async (propertyId: string, currentlyArchived: boolean) => {
    const { error } = await supabase
      .from('properties')
      .update({ archived: !currentlyArchived })
      .eq('id', propertyId)

    if (error) {
      console.error('Error updating archive status:', error)
      return
    }

    await fetchProperties(showArchived)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <Link
          href="/landlord/properties/new"
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition"
        >
          + Add property
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Your properties</h1>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-white/40 hover:text-white text-sm transition"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>

        {properties.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-12 text-center">
            <div className="text-4xl mb-4">🏠</div>
            <h3 className="text-white font-semibold mb-2">
              {showArchived ? 'No archived properties' : 'No properties yet'}
            </h3>
            {!showArchived && (
              <>
                <p className="text-white/40 text-sm mb-6">Add your first property to get started.</p>
                <Link
                  href="/landlord/properties/new"
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition inline-block"
                >
                  Add property
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {properties.map((property) => (
              <div
                key={property.id}
                className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 transition"
              >
                <div className="flex items-start justify-between">
                  <Link href={`/landlord/properties/${property.id}`} className="flex-1">
                    <h3 className="text-white font-semibold text-lg">{property.address}</h3>
                    <p className="text-white/50 text-sm mt-1">{property.city}, {property.state} {property.zip}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-xs bg-white/8 text-white/60 rounded-full px-3 py-1 capitalize">{property.property_type}</span>
                      {property.archived && (
                        <span className="text-xs bg-yellow-500/10 text-yellow-400/70 border border-yellow-500/20 rounded-full px-3 py-1">
                          Archived
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        handleArchiveToggle(property.id, property.archived)
                      }}
                      className="text-white/40 hover:text-white text-xs transition"
                    >
                      {property.archived ? 'Unarchive' : 'Archive'}
                    </button>
                    <Link href={`/landlord/properties/${property.id}`} className="text-white/30 text-xl">→</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}