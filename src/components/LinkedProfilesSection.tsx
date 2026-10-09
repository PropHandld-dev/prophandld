'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { BuildingIcon, HomeIcon, WrenchIcon, PlusIcon, CheckCircleIcon } from '@/components/icons'
import { applySessionToken } from '@/lib/profileSwitch'
import { useLanguage, t, roleLabel } from '@/lib/i18n'
import type { Role } from '@/lib/linkedProfiles'

type LinkedProfile = { id: string; role: Role; full_name: string | null }

const ROLE_ICON: Record<Role, (p: { className?: string }) => React.ReactElement> = {
  landlord: BuildingIcon,
  renter: HomeIcon,
  contractor: WrenchIcon,
}

// The Profile-page home for the same linked-profiles feature the
// ProfileButton dropdown offers from every dashboard — a fuller, slower
// version for someone who came here deliberately rather than mid-task.
export function LinkedProfilesSection({ currentRole }: { currentRole: Role }) {
  const lang = useLanguage()
  const [linked, setLinked] = useState<LinkedProfile[]>([])
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [confirmingRole, setConfirmingRole] = useState<Role | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profiles/list')
      .then((res) => res.json())
      .then((data) => {
        setLinked(data.linked || [])
        setAvailableRoles(data.availableRoles || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSwitch = async (targetUserId: string) => {
    setSwitchingId(targetUserId)
    setError(null)
    const res = await fetch('/api/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    if (!res?.ok || !data?.tokenHash) {
      setError(data?.error || t('couldNotSwitchProfile', lang))
      setSwitchingId(null)
      return
    }
    await applySessionToken(data.tokenHash, data.role)
  }

  const handleCreate = async (newRole: Role) => {
    setCreating(true)
    setError(null)
    const res = await fetch('/api/profiles/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    if (!res?.ok) {
      setError(data?.error || t('couldNotCreateProfile', lang))
      setCreating(false)
      return
    }
    if (data?.tokenHash) {
      await applySessionToken(data.tokenHash, newRole)
    } else {
      window.location.reload()
    }
  }

  if (loading) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
        <div className="h-5 w-32 bg-white/5 rounded mb-4 animate-pulse" />
        <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-4">{t('yourProfiles', lang)}</h2>

      <div className="space-y-2 mb-2">
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
          {(() => { const Icon = ROLE_ICON[currentRole]; return <Icon className="w-4 h-4 text-[#12A5A9] shrink-0" /> })()}
          <span className="text-white text-sm font-medium flex-1">{roleLabel(currentRole, lang)}</span>
          <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" />
        </div>
        {linked.map((p) => {
          const Icon = ROLE_ICON[p.role]
          const switching = switchingId === p.id
          return (
            <button
              key={p.id}
              onClick={() => handleSwitch(p.id)}
              disabled={switching}
              className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/8 rounded-xl px-4 py-3 transition disabled:opacity-50 text-left"
            >
              <Icon className="w-4 h-4 text-white/50 shrink-0" />
              <span className="text-white/80 text-sm flex-1">{roleLabel(p.role, lang)}</span>
              <span className="text-[#12A5A9] text-xs font-semibold">
                {switching ? t('switchingDots', lang) : t('switchToProfile', lang)}
              </span>
            </button>
          )
        })}
      </div>

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      {confirmingRole ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2">
          <p className="text-white text-sm font-medium mb-1">
            {t('createProfileConfirmTitle', lang).replace('{role}', roleLabel(confirmingRole, lang))}
          </p>
          <p className="text-white/50 text-xs leading-relaxed mb-3">
            {t('createProfileConfirmBody', lang).replace('{role}', roleLabel(confirmingRole, lang))}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setConfirmingRole(null); setError(null) }}
              disabled={creating}
              className="flex-1 bg-white/5 border border-white/10 text-white/60 text-xs font-semibold py-2.5 rounded-xl hover:bg-white/8 transition disabled:opacity-40"
            >
              {t('cancel', lang)}
            </button>
            <RippleButton
              onClick={() => handleCreate(confirmingRole)}
              disabled={creating}
              className="flex-[1.5] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {creating ? t('creatingProfileDots', lang) : t('createProfileBtn', lang)}
            </RippleButton>
          </div>
        </div>
      ) : (
        availableRoles.map((r) => (
          <button
            key={r}
            onClick={() => setConfirmingRole(r)}
            className="w-full flex items-center gap-2.5 mt-2 border border-dashed border-white/15 text-white/60 hover:text-white hover:border-white/30 rounded-xl px-4 py-3 text-sm font-medium transition"
          >
            <PlusIcon className="w-4 h-4" />
            {t('addProfileRole', lang)} {roleLabel(r, lang)}
          </button>
        ))
      )}
    </ScrollReveal>
  )
}
