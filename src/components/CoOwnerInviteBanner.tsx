'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { ShieldIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

type PendingInvite = { id: string; name: string }

// Shown on the landlord dashboard, persistent until acted on (unlike
// ProfileSwitchedBanner's 4-second toast) — a co-owner invite is a real
// access grant the recipient needs to actually decide on, not just a
// confirmation to glance at.
export function CoOwnerInviteBanner() {
  const lang = useLanguage()
  const [invite, setInvite] = useState<PendingInvite | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/co-owner/list')
      .then((res) => res.json())
      .then((data) => {
        const pending = (data.iAmCoOwnerOf || []).find((c: any) => c.status === 'pending')
        if (pending) setInvite({ id: pending.id, name: pending.name })
      })
      .catch(() => {})
  }, [])

  const handleAccept = async () => {
    if (!invite) return
    setBusy(true)
    const res = await fetch('/api/co-owner/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId: invite.id }),
    }).catch(() => null)
    setBusy(false)
    if (res?.ok) window.location.reload()
  }

  const handleDecline = async () => {
    if (!invite) return
    setBusy(true)
    await supabase.from('landlord_co_owners').delete().eq('id', invite.id)
    setInvite(null)
    setBusy(false)
  }

  if (!invite) return null

  return (
    <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-2xl px-5 py-4 mb-6">
      <div className="flex items-start gap-3">
        <ShieldIcon className="w-5 h-5 text-[#12A5A9] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold text-sm mb-1">
            {t('coOwnerBannerTitle', lang).replace('{name}', invite.name)}
          </p>
          <p className="text-white/60 text-xs leading-relaxed mb-3">{t('coOwnerBannerBody', lang)}</p>
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
