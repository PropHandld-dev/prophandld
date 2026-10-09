'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BuildingIcon, HomeIcon, WrenchIcon, ChevronDownIcon, PlusIcon, CheckCircleIcon } from '@/components/icons'
import { applySessionToken } from '@/lib/profileSwitch'
import { useLanguage, t, roleLabel } from '@/lib/i18n'
import type { Role } from '@/lib/linkedProfiles'

type LinkedProfile = { id: string; role: Role; full_name: string | null }

const ROLE_ICON: Record<Role, (p: { className?: string }) => React.ReactElement> = {
  landlord: BuildingIcon,
  renter: HomeIcon,
  contractor: WrenchIcon,
}

// Top-right corner of the dashboards: the signed-in person's initials (and
// name on wider screens). Doubles as the profile switcher — a person with
// more than one linked profile (landlord + contractor, say) gets a
// dropdown instead of a plain link straight to /profile, so switching is
// one tap from wherever they already are, not a detour through Profile
// settings first.
export function ProfileButton({ name, currentRole }: { name?: string | null; currentRole?: Role }) {
  const lang = useLanguage()
  const [open, setOpen] = useState(false)
  const [linked, setLinked] = useState<LinkedProfile[]>([])
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])
  const [loaded, setLoaded] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [confirmingRole, setConfirmingRole] = useState<Role | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const label = (name || '').trim()
  const initials =
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?'

  useEffect(() => {
    if (!open || loaded) return
    fetch('/api/profiles/list')
      .then((res) => res.json())
      .then((data) => {
        setLinked(data.linked || [])
        setAvailableRoles(data.availableRoles || [])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [open, loaded])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmingRole(null)
        setError(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSwitch = async (targetUserId: string) => {
    setSwitchingId(targetUserId)
    setError(null)
    try {
      const res = await fetch('/api/profiles/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      })
      const data = await res.json()
      if (!res.ok || !data.tokenHash) {
        setError(data.error || t('couldNotSwitchProfile', lang))
        setSwitchingId(null)
        return
      }
      await applySessionToken(data.tokenHash, data.role)
    } catch {
      setError(t('couldNotSwitchProfile', lang))
      setSwitchingId(null)
    }
  }

  const handleCreate = async (newRole: Role) => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/profiles/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('couldNotCreateProfile', lang))
        setCreating(false)
        return
      }
      if (data.tokenHash) {
        await applySessionToken(data.tokenHash, newRole)
      } else {
        window.location.href = '/profile'
      }
    } catch {
      setError(t('couldNotCreateProfile', lang))
      setCreating(false)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Your profile"
        aria-expanded={open}
        className="group flex items-center gap-1.5 rounded-full transition active:scale-[0.97] motion-reduce:active:scale-100"
      >
        {label && <span className="hidden sm:block text-white/60 text-sm transition group-hover:text-white">{label}</span>}
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-bold flex items-center justify-center ring-1 ring-white/10 transition group-hover:ring-[#12A5A9]/60">
          {initials}
        </span>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-[#0F2138] border border-white/10 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden z-30 motion-safe:animate-[fadeIn_0.15s_ease-out]">
          {!loaded ? (
            <div className="p-4 space-y-2">
              <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
              <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
            </div>
          ) : confirmingRole ? (
            <div className="p-4">
              <h4 className="text-white font-semibold text-sm mb-1.5">
                {t('createProfileConfirmTitle', lang).replace('{role}', roleLabel(confirmingRole, lang))}
              </h4>
              <p className="text-white/50 text-xs leading-relaxed mb-3">
                {t('createProfileConfirmBody', lang).replace('{role}', roleLabel(confirmingRole, lang))}
              </p>
              {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmingRole(null); setError(null) }}
                  disabled={creating}
                  className="flex-1 bg-white/5 border border-white/10 text-white/60 text-xs font-semibold py-2.5 rounded-xl hover:bg-white/8 transition disabled:opacity-40"
                >
                  {t('cancel', lang)}
                </button>
                <button
                  onClick={() => handleCreate(confirmingRole)}
                  disabled={creating}
                  className="flex-[1.5] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
                >
                  {creating ? t('creatingProfileDots', lang) : t('createProfileBtn', lang)}
                </button>
              </div>
            </div>
          ) : (
            <>
              {(linked.length > 0 || currentRole) && (
                <div className="p-2 border-b border-white/8">
                  <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1.5">{t('yourProfiles', lang)}</p>
                  {currentRole && (
                    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl">
                      {(() => { const Icon = ROLE_ICON[currentRole]; return <Icon className="w-4 h-4 text-[#12A5A9] shrink-0" /> })()}
                      <span className="text-white text-sm font-medium flex-1">{roleLabel(currentRole, lang)}</span>
                      <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" />
                    </div>
                  )}
                  {linked.map((p) => {
                    const Icon = ROLE_ICON[p.role]
                    const switching = switchingId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleSwitch(p.id)}
                        disabled={switching}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition disabled:opacity-50 text-left"
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
              )}

              {availableRoles.length > 0 && (
                <div className="p-2 border-b border-white/8">
                  {availableRoles.map((r) => (
                    <button
                      key={r}
                      onClick={() => setConfirmingRole(r)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition text-left"
                    >
                      <PlusIcon className="w-4 h-4 text-white/40 shrink-0" />
                      <span className="text-white/70 text-sm">{t('addProfileRole', lang)} {roleLabel(r, lang)}</span>
                    </button>
                  ))}
                </div>
              )}

              {error && <p className="text-red-400 text-xs px-4 py-2">{error}</p>}

              <Link
                href="/profile"
                className="block px-4 py-3 text-white/60 hover:text-white hover:bg-white/5 text-sm font-medium transition"
                onClick={() => setOpen(false)}
              >
                {t('viewProfileLink', lang)}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
