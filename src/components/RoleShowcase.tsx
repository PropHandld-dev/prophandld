'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  BuildingIcon,
  AlertTriangleIcon,
  WrenchIcon,
  CheckCircleIcon,
  HomeIcon,
  DollarSignIcon,
  ClipboardListIcon,
  FileTextIcon,
  ShieldIcon,
} from '@/components/icons'

type Role = 'landlord' | 'property_manager' | 'renter' | 'contractor'

const TONE_STYLES: Record<string, string> = {
  red: 'bg-red-500/15 text-red-400',
  yellow: 'bg-yellow-500/15 text-yellow-400',
  teal: 'bg-[#12A5A9]/15 text-[#12A5A9]',
}

const TABS: { role: Role; label: string; tagline: string; path: string; ctaLabel: string; ctaHref: string }[] = [
  { role: 'landlord', label: 'Landlords', tagline: 'Every property, one dashboard.', path: 'app.prophandld.com/landlord', ctaLabel: 'Sign up as a landlord', ctaHref: '/signup?role=landlord' },
  { role: 'property_manager', label: 'Property Managers', tagline: 'Every client, one login.', path: 'app.prophandld.com/landlord/pm', ctaLabel: 'See how it works for property managers', ctaHref: '/property-managers' },
  { role: 'renter', label: 'Renters', tagline: 'Report issues and pay rent in seconds.', path: 'app.prophandld.com/renter', ctaLabel: 'Sign up as a renter', ctaHref: '/signup?role=renter' },
  { role: 'contractor', label: 'Contractors', tagline: 'Real jobs, sealed bids, picked on merit.', path: 'app.prophandld.com/contractor', ctaLabel: 'See how it works for contractors', ctaHref: '/contractors' },
]

const PROPERTIES = [
  { address: '123 Oak St', detail: '3 units · 3 occupied' },
  { address: '456 Elm Ave', detail: '1 unit · 1 occupied' },
]

const LANDLORD_ALERTS = [
  { icon: AlertTriangleIcon, tone: 'red', title: 'Kitchen sink leak', subtitle: '123 Oak St · Unit 2', badge: 'New' },
  { icon: WrenchIcon, tone: 'yellow', title: 'Bathroom fan replacement', subtitle: '789 Pine St · Unit B', badge: '3 bids' },
] as const

const COMPLIANCE_ITEMS = [
  { icon: CheckCircleIcon, tone: 'teal', title: 'Rental license', subtitle: '123 Oak St', badge: 'Valid' },
  { icon: AlertTriangleIcon, tone: 'yellow', title: 'Fire extinguisher inspection', subtitle: '✦ AI flagged · 456 Elm Ave', badge: '12 days left' },
] as const

const RENTER_ISSUES = [
  { title: 'Leaky kitchen faucet', status: 'Landlord is finding a contractor', tone: 'yellow' },
  { title: 'HVAC filter service', status: 'Scheduled for Thursday', tone: 'teal' },
] as const

const CONTRACTOR_JOBS = [
  { title: 'Bathroom fan replacement', meta: '789 Pine St · 2.1 mi', badge: 'Bid now' },
  { title: 'Water heater inspection', meta: '456 Elm Ave · 4.6 mi', badge: 'Bid now' },
] as const

const CONTRACTOR_CREDENTIALS = [
  { icon: ShieldIcon, tone: 'teal', title: 'License', subtitle: 'HVAC & plumbing', badge: 'Verified' },
  { icon: ShieldIcon, tone: 'teal', title: 'Insurance', subtitle: 'General liability', badge: 'Verified' },
] as const

const PM_CLIENTS = [
  { name: 'Alex Rivera', units: 11, status: 'pending' as const },
  { name: 'Dana Osei', units: 4, status: 'ok' as const },
  { name: 'Marcus Lee', units: 7, status: 'ok' as const },
]

const PM_PENDING_JOB = { category: 'Bathroom fan replacement', address: '789 Pine St', client: 'Alex Rivera' }

// A restrained 3D tilt + cursor-follow glare — desktop/fine-pointer only
// (touch devices never fire mousemove, so this is naturally inert there),
// and off entirely under prefers-reduced-motion. The rotation range is
// deliberately small (max ~6deg) so it reads as "this card has weight and
// responds to you" rather than a gimmick fighting the content inside it.
function WindowChrome({ path, children }: { path: string; children: React.ReactNode }) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 })
  const [reducedMotion, setReducedMotion] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    setTilt({ rx: (0.5 - py) * 10, ry: (px - 0.5) * 10, mx: px * 100, my: py * 100 })
  }

  const handleMouseLeave = () => setTilt({ rx: 0, ry: 0, mx: 50, my: 50 })

  return (
    <div style={{ perspective: '1600px' }}>
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          transformStyle: 'preserve-3d',
        }}
        className="relative rounded-3xl border border-white/10 bg-[#0F2138] shadow-[0_40px_120px_-40px_rgba(18,165,169,0.35)] overflow-hidden"
      >
        {!reducedMotion && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300 z-10"
            style={{
              background: `radial-gradient(500px circle at ${tilt.mx}% ${tilt.my}%, rgba(18,165,169,0.12), transparent 60%)`,
            }}
          />
        )}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8 bg-white/[0.02]">
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="ml-3 text-white/50 text-xs">{path}</span>
        </div>
        <div className="p-6 sm:p-8 text-left min-h-[420px]">{children}</div>
      </div>
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

      {/* Matches the real dashboard's own "Your portfolio" card — now
          the first thing a landlord sees, not an afterthought. Missing
          here entirely used to be the gap: the mock showed none of the
          AI morning-briefing feature at all. */}
      <div className="bg-gradient-to-br from-[#0A7B7E]/15 to-white/[0.02] border border-[#12A5A9]/25 rounded-2xl p-4 mb-4">
        <span className="text-[#12A5A9] text-[10px] font-semibold tracking-wide">✦ PROPHANDLD AI</span>
        <p className="text-white/70 text-xs mt-1.5">Rent at 2230 Logan Circle is 6 days late, worth following up soon.</p>
        {/* Matches the real portfolio-digest card's own ask bar
            (PortfolioDigestCard.tsx) — the demo previously only showed the
            passive digest line and dropped the fact that it's a real,
            two-way AI you can ask things, not just a notification. */}
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white/40 text-xs truncate">
            Ask something, like 'when does my rental license expire?'
          </div>
          <span className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
            Ask
          </span>
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

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
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

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white/70 text-xs font-semibold">Compliance</p>
          <span className="text-[10px] sm:text-xs font-semibold text-yellow-400 bg-yellow-500/15 px-2 py-0.5 rounded-full">1 needs attention</span>
        </div>
        <div className="space-y-2.5">
          {COMPLIANCE_ITEMS.map(({ icon: Icon, tone, title, subtitle, badge }) => (
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

function PmPreview() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-white font-semibold">Riverside Property Group</p>
          <p className="text-white/60 text-xs mt-0.5">3 clients, 22 units, one dashboard</p>
        </div>
        <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 items-center justify-center">
          <BuildingIcon className="w-4 h-4 text-[#12A5A9]" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[['22', 'Units managed'], ['1', 'Open job'], ['$18,400', 'Rent this month']].map(([value, label]) => (
          <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-lg sm:text-xl font-bold text-white tabular-nums">{value}</div>
            <div className="text-white/60 text-[10px] sm:text-xs mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
        <p className="text-white/70 text-xs font-semibold mb-3">Pending approvals</p>
        <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-yellow-500/15 text-yellow-400">
            <WrenchIcon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs sm:text-sm font-medium truncate">{PM_PENDING_JOB.category}</p>
            <p className="text-white/60 text-[10px] sm:text-xs truncate">
              {PM_PENDING_JOB.address} · {PM_PENDING_JOB.client}
            </p>
          </div>
          <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 bg-yellow-500/15 text-yellow-400">Review</span>
        </div>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
        <p className="text-white/70 text-xs font-semibold mb-3">Clients</p>
        <div className="space-y-2.5">
          {PM_CLIENTS.map((c) => (
            <div key={c.name} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'pending' ? 'bg-yellow-400' : 'bg-[#12A5A9]'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs sm:text-sm font-medium truncate">{c.name}</p>
                <p className="text-white/60 text-[10px] sm:text-xs truncate">{c.units} units</p>
              </div>
              <span className="text-[10px] sm:text-xs text-white/40 shrink-0">${(c.units * 1600).toLocaleString()}/mo</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldIcon className="w-3.5 h-3.5 text-white/60" />
          <p className="text-white/70 text-xs font-semibold">Approval thresholds</p>
        </div>
        <p className="text-white/60 text-[10px] sm:text-xs">Small repairs go through automatically. Bigger ones wait for the owner&apos;s sign-off.</p>
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

      {/* Matches the real renter dashboard's own layout (and its code
          comment explaining why): Pay rent and Report an issue as the
          very first thing, not buried after "Your home" — this mock had
          drifted from an earlier version of that page and still showed
          the old order. */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white/3 border border-white/8 rounded-2xl py-5 px-3 text-center">
          <div className="w-9 h-9 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mx-auto mb-2">
            <DollarSignIcon className="w-4 h-4 text-[#12A5A9]" />
          </div>
          <span className="text-white font-semibold text-xs sm:text-sm">Pay rent</span>
        </div>
        <div className="bg-gradient-to-br from-[#0A7B7E]/20 to-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-2xl py-5 px-3 text-center">
          <div className="w-9 h-9 rounded-full bg-[#12A5A9]/20 flex items-center justify-center mx-auto mb-2">
            <WrenchIcon className="w-4 h-4 text-[#12A5A9]" />
          </div>
          <span className="text-white font-semibold text-xs sm:text-sm">Report an issue</span>
          {/* Matches how AI is actually scoped (landlord-paid add-on,
              benefits their renters automatically) — the AiAssistShowcase
              section further down the page covers the "optional add-on"
              framing in full, this is just a glanceable mention. */}
          <p className="text-[#12A5A9]/80 text-[10px] mt-1">✦ AI tries a fix first</p>
        </div>
      </div>

      {/* Matches the real renter dashboard's own "Needs your attention"
          card — a proposed schedule time waiting on the tenant's review
          is a common, real alert state, missing from this mock before. */}
      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
        <p className="text-white/70 text-xs font-semibold mb-3">Needs your attention</p>
        <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-yellow-500/15 text-yellow-400">
            <WrenchIcon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs sm:text-sm font-medium truncate">Electrical</p>
            <p className="text-white/60 text-[10px] sm:text-xs truncate">New time proposed</p>
          </div>
          <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 bg-yellow-500/15 text-yellow-400">Review</span>
        </div>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
        <p className="text-white/70 text-xs font-semibold mb-1">Your home</p>
        <p className="text-white text-sm">789 Pine St · Unit B</p>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <FileTextIcon className="w-3.5 h-3.5 text-white/60" />
          <p className="text-white/70 text-xs font-semibold">Documents</p>
        </div>
        <p className="text-white/60 text-[10px] sm:text-xs">Your lease and anything shared with you.</p>
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

      {/* Matches the real contractor dashboard's own three stat tiles —
          rating is real too (★ average + review count, on Settings, not
          the dashboard itself), shown lower down in Your credentials
          instead of mixed into these three. */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-white">6</div>
          <div className="text-white/60 text-[10px] sm:text-xs mt-0.5">New Jobs</div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-white">3</div>
          <div className="text-white/60 text-[10px] sm:text-xs mt-0.5">My jobs</div>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
          <div className="text-xl sm:text-2xl font-bold text-white">$2,400</div>
          <div className="text-white/60 text-[10px] sm:text-xs mt-0.5">Earnings</div>
        </div>
      </div>

      {/* Matches the real contractor dashboard's own Payouts/Verification
          row — real trust signals shown to every contractor, missing
          from this mock before. */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
          <p className="text-white font-semibold text-xs sm:text-sm">Payouts</p>
          <p className="text-[#12A5A9] text-[10px] sm:text-xs mt-0.5">Active</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
          <p className="text-white font-semibold text-xs sm:text-sm">Verification</p>
          <p className="text-white/50 text-[10px] sm:text-xs mt-0.5">Under review</p>
        </div>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5 mb-4">
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

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-white/70 text-xs font-semibold">Your credentials</p>
          {/* Real feature, just lives on Settings rather than the
              dashboard itself — ★ average plus review count, backed by
              get_contractor_rating_summary. */}
          <span className="text-xs font-semibold text-white">★ 4.9 <span className="text-white/40 font-normal">(31)</span></span>
        </div>
        <p className="text-white/50 text-[10px] sm:text-xs mb-3">Landlords see this before picking a bid.</p>
        <div className="space-y-2.5">
          {CONTRACTOR_CREDENTIALS.map(({ icon: Icon, tone, title, subtitle, badge }) => (
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

const PREVIEWS: Record<Role, () => React.ReactElement> = {
  landlord: LandlordPreview,
  property_manager: PmPreview,
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

      <p className="text-white/50 text-xs text-center mt-4 mb-3">Sample dashboard, shown with example data</p>

      {/* A mobile visitor lands here right under the hero and can already
          pick their role via the tabs above -- this turns that pick into
          an actual next step instead of leaving the demo as a dead end
          they'd have to keep scrolling past everything else to act on. */}
      <div className="text-center">
        <Link href={activeTab.ctaHref} className="text-[#12A5A9] text-sm font-semibold hover:underline">
          {activeTab.ctaLabel} →
        </Link>
      </div>
    </div>
  )
}
