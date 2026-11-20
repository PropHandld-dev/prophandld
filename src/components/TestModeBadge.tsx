'use client'

import { usePathname } from 'next/navigation'

// While payments run on Stripe's test keys, every signed-in screen says so,
// so nobody mistakes a test charge for real money. Disappears by itself
// once live keys are in place. Hidden on the public landing/auth pages.
const IS_TEST = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').startsWith('pk_test')

export function TestModeBadge() {
  const pathname = usePathname() || '/'
  const inApp = ['/landlord', '/renter', '/contractor', '/profile', '/admin', '/receipts'].some((p) => pathname.startsWith(p))
  if (!IS_TEST || !inApp) return null
  return (
    <div
      role="note"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] pointer-events-none rounded-full bg-[#FBBF24] text-[#111827] text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 shadow"
    >
      Test mode · no real money
    </div>
  )
}
