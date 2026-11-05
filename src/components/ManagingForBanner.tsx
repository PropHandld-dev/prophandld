'use client'

import { useEffect, useState } from 'react'
import { useLanguage, t } from '@/lib/i18n'

// Persistent, site-wide context for whoever is signed in as an accepted
// co-owner/manager of someone else's portfolio — not just on Profile's
// Co-owners card, which only an explicit visit ever surfaced this on. An
// external audit (2026-11-05, "Owner & property-manager review")
// specifically called out that the app gave no persistent "Managing for X"
// label anywhere, which is also exactly what made a real billing-vs-total
// unit-count mismatch (see landlord/page.tsx and BillingReminder.tsx) read
// as a bug instead of two numbers with a legible, different scope. Mounted
// once in landlord/layout.tsx so every /landlord/* page gets it without
// each page wiring it in separately; renders nothing for an ordinary
// landlord with no co-managed portfolio.
export function ManagingForBanner() {
  const lang = useLanguage()
  const [managingFor, setManagingFor] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/co-owner/list')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const active = (data?.iAmCoOwnerOf || []).find((c: { status: string }) => c.status === 'accepted')
        setManagingFor(active?.name || null)
      })
      .catch(() => {})
  }, [])

  if (!managingFor) return null

  return (
    <div className="bg-[#12A5A9]/10 border-b border-[#12A5A9]/20 px-4 py-1.5 text-center">
      <p className="text-[#12A5A9] text-xs font-medium">
        {t('managingForBannerPrefix', lang)} {managingFor}
      </p>
    </div>
  )
}
