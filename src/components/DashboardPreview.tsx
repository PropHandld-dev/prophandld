import { BuildingIcon, AlertTriangleIcon, WrenchIcon, CheckCircleIcon } from '@/components/icons'

const ALERTS = [
  { icon: AlertTriangleIcon, tone: 'red', title: 'Kitchen sink leak', subtitle: '123 Oak St · Unit 2', badge: 'New' },
  { icon: WrenchIcon, tone: 'yellow', title: 'Bathroom fan replacement', subtitle: '789 Pine St · Unit B', badge: '3 bids' },
  { icon: CheckCircleIcon, tone: 'teal', title: 'HVAC filter service', subtitle: '456 Elm Ave', badge: 'Scheduled' },
] as const

const TONE_STYLES: Record<string, string> = {
  red: 'bg-red-500/15 text-red-400',
  yellow: 'bg-yellow-500/15 text-yellow-400',
  teal: 'bg-[#12A5A9]/15 text-[#12A5A9]',
}

export function DashboardPreview() {
  return (
    <div className="relative rounded-3xl border border-white/10 bg-[#0F2138] shadow-[0_40px_120px_-40px_rgba(18,165,169,0.35)] overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8 bg-white/[0.02]">
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-white/30 text-xs">app.prophandld.com/landlord</span>
      </div>

      <div className="p-6 sm:p-8 text-left">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-white font-semibold">Good morning, Alex</p>
            <p className="text-white/40 text-xs mt-0.5">Here's what's happening across your properties</p>
          </div>
          <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 items-center justify-center">
            <BuildingIcon className="w-4 h-4 text-[#12A5A9]" />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            ['4', 'Properties'],
            ['11', 'Total units'],
            ['9', 'Occupied'],
          ].map(([value, label]) => (
            <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-4 text-center">
              <div className="text-xl sm:text-2xl font-bold text-white">{value}</div>
              <div className="text-white/40 text-[10px] sm:text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Alerts card */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-5">
          <p className="text-white/70 text-xs font-semibold mb-3">Needs your attention</p>
          <div className="space-y-2.5">
            {ALERTS.map(({ icon: Icon, tone, title, subtitle, badge }) => (
              <div key={title} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-3 py-2.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${TONE_STYLES[tone]}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs sm:text-sm font-medium truncate">{title}</p>
                  <p className="text-white/40 text-[10px] sm:text-xs truncate">{subtitle}</p>
                </div>
                <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${TONE_STYLES[tone]}`}>
                  {badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
