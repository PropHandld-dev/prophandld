'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface TabItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export function BottomTabBar({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#0C1A2E]/95 backdrop-blur-sm border-t border-white/8 flex items-stretch justify-around z-30 pb-[env(safe-area-inset-bottom)]">
      {tabs.map((tab) => {
        const isActive = tab.href === '/'
          ? pathname === '/'
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition ${
              isActive ? 'text-[#12A5A9]' : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
