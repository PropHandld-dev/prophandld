'use client'

import { useEffect, useState } from 'react'
import {
  BuildingIcon,
  AlertTriangleIcon,
  WrenchIcon,
  CheckCircleIcon,
  HomeIcon,
  DollarSignIcon,
  ClipboardListIcon,
} from '@/components/icons'

type Role = 'landlord' | 'renter' | 'contractor'

const TONE_STYLES: Record<string, string> = {
  red: 'bg-red-500/15 text-red-400',
  yellow: 'bg-yellow-500/15 text-yellow-400',
  teal: 'bg-[#12A5A9]/15 text-[#12A5A9]',
}

const TABS: { role: Role; label: string; tagline: string; path: string }[] = [
  { role: 'landlord', label: 'Landlords', tagline: 'Every property, one dashboard.', path: 'app.prophandld.com/landlord' },
  { role: 'renter', label: 'Renters', tagline: 'Report issues and pay rent in seconds.', path: 'app.prophandld.com/renter' },
  { role: 'contractor', label: 'Contractors', tagline: 'Real jobs, sealed bids, picked on merit.', path: 'app.prophandld.com/contractor' },
]

const PROPERTIES = [
  { address: '123 Oak St', detail: '3 units · 3 occupied' },
  { address: '456 Elm Ave', detail: '1 unit · 1 occupied' },
]

const LANDLORD_ALERTS = [
  { icon: AlertTriangleIcon, tone: 'red', title: 'Kitchen sink leak', subtitle: '123 Oak St · Unit 2', badge: 'New' },
  { icon: WrenchIcon, tone: 'yellow', title: 'Bathroom fan replacement', subtitle: '789 Pine St · Unit B', badge: '3 bids' },
] as const

const RENTER_ISSUES = [
  { title: 'Leaky kitchen faucet', status: 'Landlord is finding a contractor', tone: 'yellow' },
  { title: 'HVAC filter service', status: 'Scheduled for Thursday', tone: 'teal' },
] as const

const CONTRACTOR_JOBS = [
  { title: 'Bathroom fan replacement', meta: '789 Pine St · 2.1 mi', badge: 'Bid now' },
  { title: 'Water heater inspection', meta: '456 Elm Ave · 4.6 mi', badge: 'Bid now' },
] as const

function WindowChrome({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-3xl border border-white/10 bg-[#0F2138] shadow-[0_40px_120px_-40px_rgba(18,165,169,0.35)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8 bg-white/[0.02]">
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-white/50 text-xs">{path}</span>
      </div>
      <div className="p-6 sm:p-8 text-left min-h-[420px]">{children}</div>
    </div>
  )
}

function LandlordPreview() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-white font-semibold">Good morning, Alex</p>
          <p className="text-white/60 text-xs mt-0.5">Here&apos;s what&apos;s happening across your properties</p>
        </div>
        <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 items-center justify-center">
          <BuildingIcon className="w-4 h-4 text-[#12A5A9]" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[['4', 'Properties'], ['11', 'Total units'], ['9', 'Occupied']].map(([value, label]) => (
          <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xl sm:text-2xl font-bold text-white">{value}</div>
            <div className="text-white/60 text-[10px] sm:text-xs mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
        <p className="text-white/70 text-xs font-semibold mb-3">Your properties</p>
        <div className="space-y-2.5">
          {PROPERTIES.map((p) => (
            <div key={p.address} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-[#12A5A9]/15 text-[#12A5A9]">
                <BuildingIcon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs sm:text-sm font-medium truncate">{p.address}</p>
                <p className="text-white/60 text-[10px] sm:text-xs truncate">{p.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5">
        <p className="text-white/70 text-xs font-semibold mb-3">Needs your attention</p>
        <div className="space-y-2.5">
          {LANDLORD_ALERTS.map(({ icon: Icon, tone, title, subtitle, badge }) => (
            <div key={title} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${TONE_STYLES[tone]}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs sm:text-sm font-medium truncate">{title}</p>
                <p className="text-white/60 text-[10px] sm:text-xs truncate">{subtitle}</p>
              </div>
              <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${TONE_STYLES[tone]}`}>
                {badge}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function RenterPreview() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-white font-semibold">Hi, Jamie</p>
          <p className="text-white/60 text-xs mt-0.5">Track your maintenance requests here</p>
        </div>
        <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 items-center justify-center">
          <HomeIcon className="w-4 h-4 text-[#12A5A9]" />
        </div>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
        <p className="text-white/70 text-xs font-semibold mb-1">Your home</p>
        <p className="text-white text-sm">789 Pine St · Unit B</p>
      </div>

      <div className="bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-2xl p-4 sm:p-5 mb-4 flex items-center justify-between">
        <div>
          <p className="text-white font-semibold text-sm">Report an issue</p>
          <p className="text-white/50 text-xs mt-0.5">Something broken? Let your landlord know.</p>
        </div>
        <span className="text-xs font-semibold bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white px-3 py-1.5 rounded-full shrink-0">
          Report
        </span>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSignIcon className="w-3.5 h-3.5 text-white/60" />
          <p className="text-white/70 text-xs font-semibold">Pay rent</p>
        </div>
        <p className="text-white/60 text-[10px] sm:text-xs">Secure online payments, card or bank account.</p>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5">
        <p className="text-white/70 text-xs font-semibold mb-3">Your issues</p>
        <div className="space-y-2.5">
          {RENTER_ISSUES.map((issue) => (
            <div key={issue.title} className="bg-white/[0.03] rounded-xl px-3 py-2.5">
              <p className="text-white text-xs sm:text-sm font-medium truncate">{issue.title}</p>
              <p className="text-[#12A5A9] text-[10px] sm:text-xs mt-0.5 truncate">{issue.status}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ContractorPreview() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-white font-semibold">Hi, Marcus</p>
          <p className="text-white/60 text-xs mt-0.5">6 open jobs near you</p>
        </div>
        <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 items-center justify-center">
          <WrenchIcon className="w-4 h-4 text-[#12A5A9]" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-white">6</div>
          <div className="text-white/60 text-[10px] sm:text-xs mt-0.5">Open jobs</div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-white">4.9★</div>
          <div className="text-white/60 text-[10px] sm:text-xs mt-0.5">Rating</div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-white">$2.4k</div>
          <div className="text-white/60 text-[10px] sm:text-xs mt-0.5">This month</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]">
          <CheckCircleIcon className="w-3 h-3" /> Verified ✓
        </span>
        <span className="text-white/50 text-xs">Landlords see this before picking a bid</span>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardListIcon className="w-3.5 h-3.5 text-white/60" />
          <p className="text-white/70 text-xs font-semibold">Jobs near you</p>
        </div>
        <div className="space-y-2.5">
          {CONTRACTOR_JOBS.map((job) => (
            <div key={job.title} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs sm:text-sm font-medium truncate">{job.title}</p>
                <p className="text-white/60 text-[10px] sm:text-xs truncate">{job.meta}</p>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 bg-[#12A5A9]/15 text-[#12A5A9]">
                {job.badge}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

const PREVIEWS: Record<Role, () => React.ReactElement> = {
  landlord: LandlordPreview,
  renter: RenterPreview,
  contractor: ContractorPreview,
}

export function RoleShowcase() {
  const [activeRole, setActiveRole] = useState<Role>('landlord')
  const [autoplay, setAutoplay] = useState(true)
  const [fadeKey, setFadeKey] = useState(0)

  useEffect(() => {
    if (!autoplay) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const interval = setInterval(() => {
      setActiveRole((current) => {
        const idx = TABS.findIndex((t) => t.role === current)
        return TABS[(idx + 1) % TABS.length].role
      })
      setFadeKey((k) => k + 1)
    }, 5000)

    return () => clearInterval(interval)
  }, [autoplay])

  const handleTabClick = (role: Role) => {
    setAutoplay(false)
    setActiveRole(role)
    setFadeKey((k) => k + 1)
  }

  const activeTab = TABS.find((t) => t.role === activeRole)!
  const ActivePreview = PREVIEWS[activeRole]

  return (
    <div>
      <div className="flex items-center justify-center gap-2 mb-5 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.role}
            onClick={() => handleTabClick(tab.role)}
            className={
              tab.role === activeRole
                ? 'text-xs sm:text-sm font-semibold px-4 py-2 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white transition'
                : 'text-xs sm:text-sm font-semibold px-4 py-2 rounded-full bg-white/5 text-white/50 hover:bg-white/8 hover:text-white/80 transition'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-white/50 text-sm text-center mb-6">{activeTab.tagline}</p>

      <div key={fadeKey} className="motion-safe:animate-[fadeIn_0.4s_ease-out]">
        <WindowChrome path={activeTab.path}>
          <ActivePreview />
        </WindowChrome>
      </div>

      <p className="text-white/50 text-xs text-center mt-4">Sample dashboard, shown with example data</p>
    </div>
  )
}
