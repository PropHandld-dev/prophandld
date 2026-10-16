'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BuildingIcon, HomeIcon, WrenchIcon, ChevronDownIcon, PlusIcon } from '@/components/icons'
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
// name on wider screens). A person with linked profiles gets a dropdown to
// switch from wherever they already are; everyone else (the large
// majority — most people only ever have the one role) gets exactly what
// this was before linked profiles existed: a plain link straight to
// /profile, no popup, nothing to dismiss.
//
// "Add a profile" only shows up inside that dropdown once someone already
// has at least one linked profile — never for the single-profile majority,
// who'd otherwise see an "add another role" pitch every time they opened
// their most-used menu for something unrelated. Once someone has shown
// they're a real multi-role user (they're already in this dropdown to
// switch), offering a third role right there is convenient, not exposure —
// they're exactly the audience it's for. Still fully available to everyone
// else too, just one more tap away on the Profile page's
// LinkedProfilesSection, the right home for a first-time, deliberate ask.
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
    // Loads on mount, not gated on opening the menu — the little dot on the
    // avatar (below) needs to know "does this person have other profiles"
    // before they've ever opened this button, or it can never do its job
    // of making the feature discoverable in the first place. One light
    // GET per dashboard load in exchange for that.
    fetch('/api/profiles/list')
      .then((res) => res.json())
      .then((data) => {
        setLinked(data.linked || [])
        setAvailableRoles(data.availableRoles || [])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

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

  const avatar = (
    <span className="relative">
      <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-bold flex items-center justify-center ring-1 ring-white/10 transition group-hover:ring-[#12A5A9]/60">
        {initials}
      </span>
      {loaded && linked.length > 0 && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#0C1A2E] flex items-center justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-[#12A5A9] ring-1 ring-[#0C1A2E]" />
        </span>
      )}
    </span>
  )

  // No linked profiles (or still loading — defaults to the common case so
  // this never flashes a dropdown open for most people) — the plain,
  // pre-feature link. Nothing to switch, so nothing to ask about.
  if (loaded && linked.length === 0) {
    return (
      <Link
        href="/profile"
        aria-label="Your profile"
        className="group flex items-center gap-1.5 rounded-full transition active:scale-[0.97] motion-reduce:active:scale-100"
      >
        {label && <span className="hidden sm:block text-white/60 text-sm transition group-hover:text-white">{label}</span>}
        {avatar}
      </Link>
    )
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
        {avatar}
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
              <div className="p-2 border-b border-white/8">
                <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide px-2.5 pt-1.5 pb-1">
                  {currentRole ? t('switchFromProfile', lang).replace('{role}', roleLabel(currentRole, lang)) : t('yourProfiles', lang)}
                </p>
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
                      <span className="inline-flex items-center text-[#12A5A9] text-xs font-semibold bg-[#12A5A9]/10 rounded-full px-2.5 py-1">
                        {switching ? t('switchingDots', lang) : t('switchBtn', lang)}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Only reachable once linked.length > 0 (the branch above
                  returns early otherwise) — someone who's already a
                  multi-role user gets the option to add one more right
                  where they already manage the others. */}
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
