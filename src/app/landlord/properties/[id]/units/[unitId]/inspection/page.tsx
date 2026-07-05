'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function MoveInInspectionPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'landlord' | 'renter' | null>(null)
  const [tenancy, setTenancy] = useState<any>(null)
  const [inspection, setInspection] = useState<any>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setCurrentUserId(user.id)

      const { data: tenancyData, error: tenancyError } = await supabase
        .from('tenancies')
        .select('*')
        .eq('unit_id', unitId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (tenancyError || !tenancyData) {
        setError('No tenancy found for this unit. A tenant must be linked before starting an inspection.')
        setLoading(false)
        return
      }
      setTenancy(tenancyData)

      const { data: propertyData } = await supabase
        .from('properties')
        .select('owner_user_id')
        .eq('id', propertyId)
        .maybeSingle()

      if (propertyData?.owner_user_id === user.id) {
        setUserRole('landlord')
      } else if (tenancyData.renter_user_id === user.id) {
        setUserRole('renter')
      } else {
        setError("You don't have access to this inspection.")
        setLoading(false)
        return
      }

      const { data: inspectionData } = await supabase
        .from('move_in_inspections')
        .select('*')
        .eq('tenancy_id', tenancyData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (inspectionData) {
        setInspection(inspectionData)
        await loadPhotos(inspectionData.id)
      }

      setLoading(false)
    }
    init()
  }, [unitId, propertyId, router])

  const loadPhotos = async (inspectionId: string) => {
    const { data: photosData, error: photosError } = await supabase
      .from('inspection_photos')
      .select('*')
      .eq('inspection_id', inspectionId)
      .order('created_at', { ascending: false })

    if (photosError) {
      console.error('Error loading photos:', photosError)
      return
    }

    if (!photosData || photosData.length === 0) {
      setPhotos([])
      return
    }

    const enriched = await Promise.all(
      photosData.map(async (photo) => {
        const { data: uploaderData } = await supabase
          .rpc('get_user_by_id', { user_id_input: photo.uploaded_by })
          .maybeSingle()
        return { ...photo, uploader: uploaderData }
      })
    )

    setPhotos(enriched)
  }

  const startInspection = async () => {
    if (!tenancy) return
    setError(null)

    const { data, error: insertError } = await supabase
      .from('move_in_inspections')
      .insert({ tenancy_id: tenancy.id, unit_id: unitId, status: 'in_progress' })
      .select()
      .single()

    if (insertError) {
      console.error('Error starting inspection:', insertError)
      setError('Could not start inspection. Please try again.')
      return
    }

    setInspection(data)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !inspection || !currentUserId || !userRole) return

    setUploading(true)
    setError(null)

    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop()
      const filePath = `${inspection.id}/${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('inspection-photos')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Error uploading photo:', uploadError)
        setError('One or more photos failed to upload.')
        continue
      }

      const { data: urlData } = supabase.storage
        .from('inspection-photos')
        .getPublicUrl(filePath)

      const { error: insertError } = await supabase
        .from('inspection_photos')
        .insert({
          inspection_id: inspection.id,
          uploaded_by: currentUserId,
          uploaded_by_role: userRole,
          photo_url: urlData.publicUrl,
        })

      if (insertError) {
        console.error('Error saving photo record:', insertError)
        setError('One or more photos failed to save.')
      }
    }

    await loadPhotos(inspection.id)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const completeInspection = async () => {
    if (!inspection) return

    const { error: updateError } = await supabase
      .from('move_in_inspections')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', inspection.id)

    if (updateError) {
      console.error('Error completing inspection:', updateError)
      setError('Could not mark inspection as complete.')
      return
    }

    setInspection({ ...inspection, status: 'completed', completed_at: new Date().toISOString() })
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}/units/${unitId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Unit
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Move-in inspection</h1>
          <p className="text-white/50 text-sm mt-1">
            Document the unit's condition with timestamped photos before move-in.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!tenancy ? null : !inspection ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm mb-4">No inspection started yet.</p>
            <button
              onClick={startInspection}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition"
            >
              Start inspection
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">
                  Status: <span className={inspection.status === 'completed' ? 'text-[#12A5A9]' : 'text-yellow-400'}>
                    {inspection.status === 'completed' ? 'Completed' : 'In progress'}
                  </span>
                </h2>
                {inspection.status !== 'completed' && (
                  <button
                    onClick={completeInspection}
                    disabled={photos.length === 0}
                    className="text-xs bg-white/8 text-white/70 px-3 py-1.5 rounded-lg hover:bg-white/12 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Mark complete
                  </button>
                )}
              </div>

              {inspection.status !== 'completed' && (
                <label className="block">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="hidden"
                  />
                  <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                    {uploading ? 'Uploading...' : '+ Add photos'}
                  </span>
                </label>
              )}
            </div>

            <div>
              <h3 className="text-white font-semibold mb-3">
                Photos {photos.length > 0 && `(${photos.length})`}
              </h3>
              {photos.length === 0 ? (
                <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
                  <p className="text-white/30 text-sm">No photos added yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                      <img
                        src={photo.photo_url}
                        alt="Inspection photo"
                        className="w-full h-40 object-cover"
                      />
                      <div className="p-3">
                        <p className="text-white/60 text-xs">
                          {photo.uploader?.full_name || 'Unknown'} · {photo.uploaded_by_role}
                        </p>
                        <p className="text-white/30 text-xs mt-0.5">
                          {new Date(photo.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
