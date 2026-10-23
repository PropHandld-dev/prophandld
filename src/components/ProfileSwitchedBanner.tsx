'use client'

import { useEffect, useState } from 'react'
import { CheckCircleIcon } from '@/components/icons'
import { useLanguage, t, roleLabel } from '@/lib/i18n'
import type { Role } from '@/lib/linkedProfiles'
import { LINKED_PROFILES_ENABLED } from '@/lib/featureFlags'

const VALID_ROLES: Role[] = ['landlord', 'renter', 'contractor']

// A profile switch is a hard navigation (applySessionToken sets
// window.location.href to the new role's dashboard) — nothing on the old
// page can show a "switched!" confirmation, since the page itself is gone
// by the time it would matter. The new dashboard reading a one-time
// ?switched=role query param is what closes that loop: direct response to
// "can switching be confusing?" — landing on a different-looking dashboard
// with zero acknowledgement that it worked as intended, versus something
// having gone wrong, was exactly the ambiguous moment to fix. Reads
// window.location directly (not useSearchParams) so this never needs a
// Suspense boundary on three page-level client components.
export function ProfileSwitchedBanner() {
  const lang = useLanguage()
  const [role, setRole] = useState<Role | null>(null)

  useEffect(() => {
    // Feature hidden for now (see LINKED_PROFILES_ENABLED) — nothing can
    // set ?switched= anymore, but guard anyway in case an old link/bookmark
    // still carries one.
    if (!LINKED_PROFILES_ENABLED) return
    const params = new URLSearchParams(window.location.search)
    const switched = params.get('switched')
    if (!switched || !VALID_ROLES.includes(switched as Role)) return

    setRole(switched as Role)
    params.delete('switched')
    const rest = params.toString()
    window.history.replaceState({}, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname)

    const timer = setTimeout(() => setRole(null), 4000)
    return () => clearTimeout(timer)
  }, [])

  if (!role) return null

  return (
    <div className="flex items-center gap-2 bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 mb-6 motion-safe:animate-[fadeIn_0.2s_ease-out]">
      <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
      <span className="text-[#12A5A9] text-sm font-medium">
        {t('switchedToProfileBanner', lang).replace('{role}', roleLabel(role, lang))}
      </span>
    </div>
  )
}
