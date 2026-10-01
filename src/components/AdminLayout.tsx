'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/weekly', label: 'This week' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/jobs', label: 'Jobs' },
  { href: '/admin/transactions', label: 'Transactions' },
  { href: '/admin/disputes', label: 'Disputes' },
  { href: '/admin/contractors', label: 'Contractors' },
  { href: '/admin/compliance', label: 'Compliance' },
  { href: '/admin/audit-log', label: 'Audit log' },
  { href: '/admin/health', label: 'System health' },
]

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // A one-shot getUser() check on mount can race right after sign-in —
    // it makes a network round-trip that can resolve before the session
    // is fully synced, bouncing a legitimate admin. onAuthStateChange's
    // first callback (INITIAL_SESSION) reflects the actual persisted
    // session instead, so it's the source of truth for "is there a
    // session at all". Whether that session is actually an admin now
    // needs its own check — admin_users has no client-readable policy,
    // by design, so /api/admin/check-access is the only way to ask.
    let cancelled = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (!user) {
        if (!cancelled) {
          setAuthorized(false)
          setChecking(false)
        }
        return
      }
      fetch('/api/admin/check-access')
        .then((r) => r.json())
        .then(async (data) => {
          if (cancelled) return
          if (!data.authorized) {
            setAuthorized(false)
            setChecking(false)
            return
          }
          // Being on the allowlist isn't enough on its own — this session
          // also has to have actually cleared the MFA challenge (aal2), not
          // just password auth (aal1). /admin/login is where that normally
          // happens; this is the belt-and-suspenders check against someone
          // typing /admin directly with a stale aal1-only session.
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (cancelled) return
          setAuthorized(aal?.currentLevel === 'aal2')
          setChecking(false)
        })
        .catch(() => {
          if (cancelled) return
          setAuthorized(false)
          setChecking(false)
        })
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (checking) return
    if (!authorized) router.replace('/admin/login')
  }, [checking, authorized, router])

  if (checking || !authorized) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <span className="text-white font-semibold text-sm">Prophandld Admin</span>
        <Link href="/" className="text-white/60 hover:text-white text-xs transition">
          Exit
        </Link>
      </nav>
      <div className="border-b border-white/8 px-6 flex items-center gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                active
                  ? 'text-sm font-semibold px-4 py-3 border-b-2 border-[#12A5A9] text-white whitespace-nowrap'
                  : 'text-sm font-medium px-4 py-3 border-b-2 border-transparent text-white/60 hover:text-white/70 transition whitespace-nowrap'
              }
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      <main className="max-w-4xl mx-auto px-6 py-10">{children}</main>
    </div>
  )
}
