'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { StarIcon } from '@/components/icons'
import { FavoriteContractorButton } from '@/components/FavoriteContractorButton'
import { startDmThread } from '@/lib/dmThreads'
import { useLanguage, t } from '@/lib/i18n'

type FavoriteContractor = {
  id: string
  fullName: string | null
  serviceCategories: string[]
  verified: boolean
  unlicensed: boolean
  credentialBadges: string[]
  rating: { avg_rating: number; review_count: number } | null
  favoritedAt: string
}

export default function MyContractorsPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [contractors, setContractors] = useState<FavoriteContractor[]>([])
  const [messagingId, setMessagingId] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/landlord/favorite-contractors?details=1')
    const data = await res.json()
    setContractors(data.contractors || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      await load()
      setLoading(false)
    }
    init()
  }, [router])

  const message = async (c: FavoriteContractor) => {
    setMessagingId(c.id)
    try {
      const { threadId, initialDraft } = await startDmThread('landlord', {
        other_user_id: c.id,
        other_role: 'contractor',
        full_name: c.fullName,
        context_label: null,
        last_job_category: null,
        last_job_completed_at: null,
        thread_id: null,
      })
      if (initialDraft) sessionStorage.setItem(`dm-draft:${threadId}`, initialDraft)
      router.push(`/landlord/messages/${threadId}`)
    } catch (err) {
      console.error('Error starting DM with contractor:', err)
      setMessagingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/60 hover:text-white text-sm font-medium transition">
          {t('backToDashboardArrowPlain', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : (
          <>
            <h1 className="text-white text-2xl font-bold mb-2">{t('myContractorsHeading', lang)}</h1>
            <p className="text-white/50 text-sm mb-6">{t('myContractorsDesc', lang)}</p>

            {contractors.length === 0 ? (
              <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 text-center">
                <StarIcon className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white font-semibold mb-1">{t('myContractorsEmptyTitle', lang)}</p>
                <p className="text-white/50 text-sm">{t('myContractorsEmptyDesc', lang)}</p>
              </ScrollReveal>
            ) : (
              <div className="space-y-3">
                {contractors.map((c) => (
                  <ScrollReveal key={c.id} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white font-semibold">{c.fullName || 'Contractor'}</p>
                          <FavoriteContractorButton
                            contractorUserId={c.id}
                            isFavorited
                            onChange={(favorited) => {
                              if (!favorited) setContractors((prev) => prev.filter((x) => x.id !== c.id))
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          {c.credentialBadges.map((label) => (
                            <span key={label} className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">
                              {label} ✓
                            </span>
                          ))}
                          {c.verified && !c.credentialBadges.length && (
                            <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">
                              {t('verifiedStatus', lang)}
                            </span>
                          )}
                          {c.unlicensed && !c.credentialBadges.length && (
                            <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5 font-semibold">
                              {t('noLicenseOnFile', lang)}
                            </span>
                          )}
                          {c.rating && (
                            <span className="text-xs bg-white/8 text-white/60 rounded-full px-2 py-0.5 font-semibold">
                              ★ {c.rating.avg_rating.toFixed(1)} ({c.rating.review_count})
                            </span>
                          )}
                        </div>
                        {c.serviceCategories.length > 0 && (
                          <p className="text-white/40 text-xs mt-2">{c.serviceCategories.slice(0, 4).join(' · ')}</p>
                        )}
                      </div>
                    </div>
                    <RippleButton
                      onClick={() => message(c)}
                      disabled={messagingId === c.id}
                      className="mt-3 bg-white/8 hover:bg-white/12 text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
                    >
                      {t('messageContractorBtn', lang)}
                    </RippleButton>
                  </ScrollReveal>
                ))}
              </div>
            )}

            <Link
              href="/landlord/contractors/invite"
              className="block text-white/60 hover:text-[#12A5A9] text-sm font-medium mt-6 transition"
            >
              {t('jobsListInviteLine', lang)}
            </Link>
          </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
