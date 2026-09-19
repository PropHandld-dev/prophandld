'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/jobs', label: 'Jobs' },
  { href: '/admin/disputes', label: 'Disputes' },
  { href: '/admin/contractors', label: 'Contractors' },
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
    // session instead, so it's the single source of truth here rather
    // than racing two separate checks against each other.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setAuthorized(!!user && !!user.email?.endsWith('@prophandld.com'))
      setChecking(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (checking) return
    if (!authorized) router.replace('/')
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
