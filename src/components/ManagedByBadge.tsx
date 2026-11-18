'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BuildingIcon } from '@/components/icons'
import { useLanguage } from '@/lib/i18n'

type ManagedBy = { name: string; profileSlug: string | null; logoUrl: string | null }

// "Managed by <company>" for tenants and contractors. Renders nothing for a
// property its owner runs themselves.
export function ManagedByBadge({ jobId, tenancyId, className = '' }: { jobId?: string; tenancyId?: string; className?: string }) {
  const lang = useLanguage()
  const [managedBy, setManagedBy] = useState<ManagedBy | null>(null)

  useEffect(() => {
    if (!jobId && !tenancyId) return
    const q = jobId ? `jobId=${jobId}` : `tenancyId=${tenancyId}`
    fetch(`/api/managed-by?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setManagedBy(d?.managedBy || null))
      .catch(() => {})
  }, [jobId, tenancyId])

  if (!managedBy) return null
  const inner = (
    <>
      {managedBy.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={managedBy.logoUrl} alt="" className="w-5 h-5 rounded-md object-cover bg-white" />
      ) : (
        <BuildingIcon className="w-3.5 h-3.5 text-[#12A5A9]" />
      )}
      <span className="text-white/50">{lang === 'es' ? 'Administrado por' : 'Managed by'}</span>
      <span className="text-white font-semibold">{managedBy.name}</span>
    </>
  )
  const cls = `inline-flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 rounded-full pl-2 pr-3 py-1 ${className}`
  return managedBy.profileSlug ? (
    <Link href={`/property-managers/${managedBy.profileSlug}`} className={`${cls} hover:border-[#12A5A9]/40 transition`}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  )
}
