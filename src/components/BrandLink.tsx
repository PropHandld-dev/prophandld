'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const HOME_BY_ROLE: Record<string, string> = {
  landlord: '/landlord',
  renter: '/renter',
  contractor: '/contractor',
}

// Signed out → the landing page. Signed in → that person's own dashboard.
function homeFor(user: User | null | undefined): string {
  if (!user) return '/'
  const fromRole = HOME_BY_ROLE[user.user_metadata?.role as string]
  if (fromRole) return fromRole
  if (user.email?.endsWith('@prophandld.com')) return '/admin'
  return '/'
}

export function BrandLink({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  // Starts at "/" so server and browser render the same thing, then swaps
  // to the dashboard once the saved session is read.
  const [href, setHref] = useState('/')

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setHref(homeFor(data.user))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHref(homeFor(session?.user))
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <Link
      href={href}
      aria-label="Prophandld home"
      className={`inline-flex items-center transition hover:opacity-80 active:scale-[0.97] motion-reduce:active:scale-100 ${className}`}
    >
      {children}
    </Link>
  )
}
