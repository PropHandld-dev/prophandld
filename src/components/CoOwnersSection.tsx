'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { PlusIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

type InvitedByMe = { id: string; status: 'pending' | 'accepted'; name: string; pendingSignup: boolean }
type IAmCoOwnerOf = { id: string; status: 'pending' | 'accepted'; name: string }

// Profile-page home for co-landlord access — mirrors LinkedProfilesSection's
// shape and visual language. Renders the "invite a co-owner" flow for an
// ordinary landlord, or a quiet "co-managing for X" line instead if the
// viewer is themselves an accepted co-owner (they have no portfolio of
// their own to invite into — see /api/co-owner/invite's own guard).
export function CoOwnersSection() {
  const lang = useLanguage()
  const [invitedByMe, setInvitedByMe] = useState<InvitedByMe[]>([])
  const [iAmCoOwnerOf, setIAmCoOwnerOf] = useState<IAmCoOwnerOf[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offerSendInvite, setOfferSendInvite] = useState(false)
  const [sentConfirm, setSentConfirm] = useState(false)

  const load = () => {
    fetch('/api/co-owner/list')
      .then((res) => res.json())
      .then((data) => {
        setInvitedByMe(data.invitedByMe || [])
        setIAmCoOwnerOf(data.iAmCoOwnerOf || [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setInviting(true)
    setError(null)
    setOfferSendInvite(false)
    setSentConfirm(false)
    const res = await fetch('/api/co-owner/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    setInviting(false)
    if (res?.ok) {
      setEmail('')
      load()
      return
    }
    if (data?.error === 'no_account_found') {
      setOfferSendInvite(true)
      return
    }
    if (data?.error === 'already_invited') {
      setError('Already invited.')
      return
    }
    if (data?.error === 'cannot_invite_as_co_owner') {
      setError(t('coOwnerCannotInvite', lang))
      return
    }
    setError(typeof data?.error === 'string' ? data.error : 'Could not send the invite.')
  }

  const handleSendInviteEmail = async () => {
    setInviting(true)
    const res = await fetch('/api/co-owner/invite-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null)
    setInviting(false)
    if (res?.ok) {
      setEmail('')
      setOfferSendInvite(false)
      setSentConfirm(true)
      load()
    } else {
      setError('Could not send the invite email.')
    }
  }

  const handleRemove = async (id: string) => {
    if (!window.confirm(t('coOwnerRemoveConfirm', lang))) return
    await supabase.from('landlord_co_owners').delete().eq('id', id)
    load()
  }

  if (loading) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
        <div className="h-5 w-32 bg-white/5 rounded mb-4 animate-pulse" />
        <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
      </div>
    )
  }

  // A co-owner (of someone else's portfolio) sees a quiet status line,
  // not the invite UI — they have no portfolio to invite anyone into.
  if (iAmCoOwnerOf.length > 0) {
    const active = iAmCoOwnerOf.find((c) => c.status === 'accepted')
    if (active) {
      return (
        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-1">{t('coOwnersTitle', lang)}</h2>
          <p className="text-white/50 text-sm">{t('coOwnerCoManaging', lang).replace('{name}', active.name)}</p>
        </ScrollReveal>
      )
    }
  }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-1">{t('coOwnersTitle', lang)}</h2>
      <p className="text-white/40 text-[13px] leading-snug mb-4">{t('coOwnersExplainer', lang)}</p>

      {invitedByMe.length > 0 && (
        <div className="space-y-2 mb-4">
          {invitedByMe.map((c) => (
            <div key={c.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
              <span className="text-white/80 text-sm flex-1 truncate">{c.name}</span>
              <span className={
                c.status === 'accepted'
                  ? 'text-[11px] font-semibold text-[#12A5A9] bg-[#12A5A9]/10 rounded-full px-2 py-0.5'
                  : 'text-[11px] font-semibold text-yellow-400 bg-yellow-500/10 rounded-full px-2 py-0.5'
              }>
                {c.status === 'accepted' ? t('coOwnerStatusAccepted', lang) : c.pendingSignup ? t('coOwnerStatusPendingSignup', lang) : t('coOwnerStatusPending', lang)}
              </span>
              <button onClick={() => handleRemove(c.id)} className="text-white/40 hover:text-red-400 text-xs font-semibold transition">
                {t('coOwnerRemoveBtn', lang)}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
      {sentConfirm && <p className="text-[#12A5A9] text-xs mb-2">{t('coOwnerInviteSentConfirm', lang)}</p>}

      {offerSendInvite ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-white/70 text-xs mb-3">{t('coOwnerSendInviteOffer', lang)}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setOfferSendInvite(false)}
              className="flex-1 bg-white/5 border border-white/10 text-white/60 text-xs font-semibold py-2.5 rounded-xl hover:bg-white/8 transition"
            >
              {t('cancel', lang)}
            </button>
            <RippleButton
              onClick={handleSendInviteEmail}
              disabled={inviting}
              className="flex-[1.5] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {inviting ? t('coOwnerInvitingDots', lang) : t('coOwnerSendInviteBtn', lang)}
            </RippleButton>
          </div>
        </div>
      ) : (
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('coOwnerInviteEmailPlaceholder', lang)}
            className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
          />
          <RippleButton
            type="submit"
            disabled={inviting || !email.trim()}
            className="shrink-0 flex items-center gap-1.5 bg-white/5 border border-dashed border-white/15 text-white/60 hover:text-white hover:border-white/30 text-sm font-medium px-4 py-2.5 rounded-xl transition disabled:opacity-50"
          >
            <PlusIcon className="w-4 h-4" />
            {inviting ? t('coOwnerInvitingDots', lang) : t('coOwnerInviteBtn', lang)}
          </RippleButton>
        </form>
      )}
    </ScrollReveal>
  )
}
