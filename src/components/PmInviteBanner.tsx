'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { BuildingIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

type PendingInvite = { id: string; orgName: string; approvalThreshold: number }

// Mirrors CoOwnerInviteBanner — same reasoning: a PM invite is a real
// access grant the owner needs to actually decide on, not something to
// leave buried on Profile. /api/pm/invites-for-me's own comment says it
// exists to power exactly this banner, but nothing on the dashboard ever
// rendered it before now; the only way to find a pending invite was the
// PropertyManagementCard tile on Profile, easy to miss entirely.
export function PmInviteBanner() {
  const lang = useLanguage()
  const [invite, setInvite] = useState<PendingInvite | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/pm/invites-for-me')
      .then((res) => res.json())
      .then((data) => {
        const pending = (data.managedBy || []).find((m: any) => m.status === 'pending')
        if (pending) setInvite({ id: pending.id, orgName: pending.orgName, approvalThreshold: pending.approvalThreshold })
      })
      .catch(() => {})
  }, [])

  const handleAccept = async () => {
    if (!invite) return
    setBusy(true)
    const res = await fetch('/api/pm/clients/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioId: invite.id }),
    }).catch(() => null)
    setBusy(false)
    if (res?.ok) window.location.reload()
  }

  const handleDecline = async () => {
    if (!invite) return
    setBusy(true)
    await fetch(`/api/pm/clients/${invite.id}`, { method: 'DELETE' }).catch(() => {})
    setInvite(null)
    setBusy(false)
  }

  if (!invite) return null

  return (
    <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-2xl px-5 py-4 mb-6">
      <div className="flex items-start gap-3">
        <BuildingIcon className="w-5 h-5 text-[#12A5A9] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold text-sm mb-1">
            {t('pmInviteBannerTitle', lang).replace('{name}', invite.orgName)}
          </p>
          <p className="text-white/60 text-xs leading-relaxed mb-3">
            {t('pmInviteBannerBody', lang).replace('{threshold}', invite.approvalThreshold.toFixed(0))}
          </p>
          <div className="flex gap-2">
            <RippleButton
              onClick={handleAccept}
              disabled={busy}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {busy ? t('coOwnerAcceptingDots', lang) : t('coOwnerAcceptBtn', lang)}
            </RippleButton>
            <button
              onClick={handleDecline}
              disabled={busy}
              className="text-white/50 hover:text-white text-xs font-semibold px-2 transition disabled:opacity-50"
            >
              {t('coOwnerDeclineBtn', lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
