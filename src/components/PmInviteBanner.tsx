'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
//
// Also renders a persistent (not just pending-state) "Managed by X" chip
// once accepted — found live: after accepting, this page never mentioned
// it again. The only place that still said so was a Profile tile nobody
// goes looking for, so a landlord who accepted weeks ago had no way to be
// reminded, or to find their way to /landlord/pm to review or remove it.
export function PmInviteBanner() {
  const lang = useLanguage()
  const [invite, setInvite] = useState<PendingInvite | null>(null)
  const [managedByOrg, setManagedByOrg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The owner's own approval limit, chosen at the moment they accept --
  // the invite used to hardcode whatever the PM had set ("up to $500 per
  // job") with no owner control at all, inverted from the locked rule
  // that this is the owner's permission grant to give.
  const [threshold, setThreshold] = useState('')
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    // Link any invite sent to this email before the account existed. Also
    // runs on password login, but OAuth signups skip that path, so this
    // makes the invite appear no matter how they got here. No-op when
    // there's nothing to link.
    fetch('/api/pm/clients/link-invite', { method: 'POST' })
      .catch(() => {})
      .then(() => fetch('/api/pm/invites-for-me'))
      .then((res) => res.json())
      .then((data) => {
        // Only invites the PM started -- a request the owner sent themselves
        // (requestedBy 'owner') is waiting on the PM, not on this owner, and
        // used to render here as "X wants to manage your property / Accept".
        const pending = (data.managedBy || []).find((m: any) => m.status === 'pending' && m.requestedBy !== 'owner')
        if (pending) {
          setInvite({ id: pending.id, orgName: pending.orgName, approvalThreshold: pending.approvalThreshold })
          setThreshold(String(pending.approvalThreshold ?? 0))
        }
        const accepted = (data.managedBy || []).find((m: any) => m.status === 'accepted')
        if (accepted) setManagedByOrg(accepted.orgName)
      })
      .catch(() => {})
  }, [])

  const handleAccept = async () => {
    if (!invite) return
    setBusy(true)
    setAcceptError(null)
    const parsed = Number(threshold)
    const res = await fetch('/api/pm/clients/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolioId: invite.id,
        approvalThreshold: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
      }),
    }).catch(() => null)
    setBusy(false)
    if (res?.ok) {
      window.location.reload()
      return
    }
    // A failed accept used to do nothing at all on screen.
    const data = res ? await res.json().catch(() => ({})) : {}
    setAcceptError(data.error || t('pmInviteAcceptFailed', lang))
  }

  const handleDecline = async () => {
    if (!invite) return
    setBusy(true)
    await fetch(`/api/pm/clients/${invite.id}`, { method: 'DELETE' }).catch(() => {})
    setInvite(null)
    setBusy(false)
  }

  if (!invite) {
    if (!managedByOrg) return null
    return (
      <Link
        href="/landlord/pm"
        className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-2xl px-5 py-3.5 mb-6 hover:border-[#12A5A9]/30 hover:bg-white/5 transition"
      >
        <BuildingIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
        <p className="text-white/60 text-sm flex-1 min-w-0 truncate">
          Managed by <span className="text-white font-medium">{managedByOrg}</span>
        </p>
        <span className="text-[#12A5A9] text-xs font-semibold shrink-0">Review →</span>
      </Link>
    )
  }

  return (
    <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-2xl px-5 py-4 mb-6">
      <div className="flex items-start gap-3">
        <BuildingIcon className="w-5 h-5 text-[#12A5A9] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold text-sm mb-1">
            {t('pmInviteBannerTitle', lang).replace('{name}', invite.orgName)}
          </p>
          <p className="text-white/60 text-xs leading-relaxed mb-3">
            {t('pmInviteBannerBody', lang)}
          </p>
          <label className="block text-white/70 text-xs font-semibold mb-1">{t('pmInviteThresholdLabel', lang)}</label>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white/60 text-sm">$</span>
            <input
              type="number"
              min={0}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={busy}
              className="w-28 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition disabled:opacity-50"
            />
            <span className="text-white/40 text-xs">{t('pmInviteThresholdHelp', lang)}</span>
          </div>
          {acceptError && <p role="alert" className="text-red-400 text-xs mt-2">{acceptError}</p>}
          <div className="flex gap-2 mt-3">
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
