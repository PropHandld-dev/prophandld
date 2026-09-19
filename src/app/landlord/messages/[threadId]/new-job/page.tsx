'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/Skeleton'
import { BuildingIcon } from '@/components/icons'

type Property = {
  id: string
  address: string
  units: { id: string; unit_number: string }[]
}

export default function NewJobFromThreadPage() {
  const params = useParams()
  const router = useRouter()
  const threadId = params.threadId as string

  const [loading, setLoading] = useState(true)
  const [contractorName, setContractorName] = useState<string>('this contractor')
  const [properties, setProperties] = useState<Property[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const [{ data: participants }, { data: propertiesData }] = await Promise.all([
        supabase.rpc('get_dm_thread_participants', { target_thread_id: threadId }),
        supabase
          .from('properties')
          .select('id, address, units(id, unit_number)')
          .eq('owner_user_id', user.id)
          .eq('archived', false)
          .order('created_at', { ascending: false }),
      ])

      const contractor = (participants || []).find((p: any) => p.role === 'contractor')
      if (contractor?.full_name) setContractorName(contractor.full_name)

      setProperties((propertiesData || []) as Property[])
      setLoading(false)
    }
    init()
  }, [threadId, router])

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href={`/landlord/messages/${threadId}`} className="text-white/50 hover:text-white text-sm transition">
          ← Back
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-14" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-16">
        <h1 className="text-2xl font-bold text-white mb-1">Start a job for {contractorName}</h1>
        <p className="text-white/60 text-sm mb-8">
          Pick which property and unit this is for. {contractorName} will be notified to bid, and the job stays open to other contractors too.
        </p>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : properties.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">Add a property first before posting a job.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {properties.map((property) => (
              <div key={property.id} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BuildingIcon className="w-4 h-4 text-[#12A5A9]" />
                  <p className="text-white font-medium text-sm">{property.address}</p>
                </div>
                {property.units.length === 0 ? (
                  <p className="text-white/50 text-xs">No units added yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {property.units.map((unit) => (
                      <button
                        key={unit.id}
                        onClick={() =>
                          router.push(
                            `/landlord/properties/${property.id}/units/${unit.id}/jobs/new?nudgeThread=${threadId}`
                          )
                        }
                        className="bg-white/5 hover:bg-[#12A5A9]/15 border border-white/10 hover:border-[#12A5A9]/40 text-white text-sm rounded-lg px-3.5 py-2 transition"
                      >
                        Unit {unit.unit_number}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
