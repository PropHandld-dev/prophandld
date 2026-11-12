'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ScrollReveal } from '@/components/ScrollReveal'
import { BuildingIcon } from '@/components/icons'

// Profile-page entry point into the full /landlord/pm dashboard — kept
// as a lightweight nav card here (like CoOwnersSection, but that one
// inlines its whole flow; PM's surface — portfolio switcher, staff,
// per-client thresholds — is a lot more than a profile card can hold,
// so this just summarizes status and links out.
export function PropertyManagementCard() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/pm/organizations').then((res) => (res.ok ? res.json() : null)),
      fetch('/api/pm/invites-for-me').then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([orgData, invitesData]) => {
        if (orgData?.membership) {
          setSummary(
            orgData.membership.memberRole === 'admin'
              ? `Admin of ${orgData.membership.organizationName}`
              : `Staff at ${orgData.membership.organizationName}`
          )
        } else if (orgData?.pendingStaffInvite) {
          setSummary(`${orgData.pendingStaffInvite.orgName} invited you to their team`)
        } else {
          const pending = (invitesData?.managedBy || []).find((m: any) => m.status === 'pending')
          const accepted = (invitesData?.managedBy || []).find((m: any) => m.status === 'accepted')
          if (pending) setSummary(`${pending.orgName} wants to manage your property`)
          else if (accepted) setSummary(`Managed by ${accepted.orgName}`)
          else setSummary(null)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <ScrollReveal>
      <Link
        href="/landlord/pm"
        className="flex items-center gap-4 bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition"
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center shrink-0">
          <BuildingIcon className="w-4 h-4 text-[#12A5A9]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold">Property Management</p>
          <p className="text-white/50 text-sm truncate">
            {loading ? 'Loading…' : summary || 'Manage multiple clients, or let a PM manage you'}
          </p>
        </div>
      </Link>
    </ScrollReveal>
  )
}
