'use client'

import Link from 'next/link'

// Top-right corner of the dashboards: the signed-in person's initials (and
// name on wider screens), tapping through to their profile.
export function ProfileButton({ name }: { name?: string | null }) {
  const label = (name || '').trim()
  const initials =
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?'

  return (
    <Link
      href="/profile"
      aria-label="Your profile"
      className="group flex items-center gap-2.5 rounded-full transition active:scale-[0.97] motion-reduce:active:scale-100"
    >
      {label && <span className="hidden sm:block text-white/60 text-sm transition group-hover:text-white">{label}</span>}
      <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-bold flex items-center justify-center ring-1 ring-white/10 transition group-hover:ring-[#12A5A9]/60">
        {initials}
      </span>
    </Link>
  )
}
