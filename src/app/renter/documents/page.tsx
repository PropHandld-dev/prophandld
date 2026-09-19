'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { FileTextIcon } from '@/components/icons'
import { RENTER_TABS } from '@/lib/navTabs'

export default function RenterDocumentsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<any[]>([])
  const [hasUnit, setHasUnit] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: tenancyData } = await supabase
        .from('tenancies')
        .select('unit_id')
        .eq('renter_user_id', user.id)
        .eq('ended', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!tenancyData) {
        setLoading(false)
        return
      }

      const { data: unitData } = await supabase
        .from('units')
        .select('property_id')
        .eq('id', tenancyData.unit_id)
        .maybeSingle()

      if (!unitData) {
        setLoading(false)
        return
      }

      setHasUnit(true)

      const { data: documentsData, error: documentsError } = await supabase
        .from('documents')
        .select('*')
        .eq('property_id', unitData.property_id)
        .order('created_at', { ascending: false })

      if (documentsError) {
        console.error('Error loading documents:', documentsError)
        setLoading(false)
        return
      }

      if (!documentsData || documentsData.length === 0) {
        setDocuments([])
        setLoading(false)
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
      setLoading(false)
    }
    init()
  }, [router])

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <div className="mb-8">
              <Skeleton className="h-7 w-40 mb-2" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
        <>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-white/50 text-sm mt-1">Your lease and related paperwork.</p>
        </div>

        {!hasUnit ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">No unit linked to your account yet.</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">No documents available yet.</p>
          </div>
        ) : (
          <ScrollReveal className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex items-start gap-3">
                    <FileTextIcon className="w-4 h-4 text-white/60 shrink-0 mt-1" />
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate">{doc.filename}</h3>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {doc.document_type && (
                          <span className="text-xs bg-[#12A5A9]/15 text-[#12A5A9] rounded-full px-2.5 py-0.5">
                            {doc.document_type}
                          </span>
                        )}
                      </div>
                      <p className="text-white/50 text-xs mt-2">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {doc.viewUrl && (
                    <a
                      href={doc.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#12A5A9] text-xs font-semibold hover:underline shrink-0"
                    >
                      View →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </ScrollReveal>
        )}
        </>
        )}
      </main>

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}
