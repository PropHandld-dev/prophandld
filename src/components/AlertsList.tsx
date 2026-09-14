import Link from 'next/link'

export interface AlertItem {
  id: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'red' | 'yellow' | 'teal'
  title: string
  subtitle?: string
  href: string
  badge: string
}

const TONE_STYLES: Record<AlertItem['tone'], { icon: string; badge: string }> = {
  red: { icon: 'bg-red-500/15 text-red-400', badge: 'bg-red-500/20 text-red-400' },
  yellow: { icon: 'bg-yellow-500/15 text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
  teal: { icon: 'bg-[#12A5A9]/15 text-[#12A5A9]', badge: 'bg-[#12A5A9]/20 text-[#12A5A9]' },
}

export function AlertsList({ items }: { items: AlertItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
      <h3 className="text-white font-semibold text-sm mb-3">
        Needs your attention ({items.length})
      </h3>
      <div className="space-y-1.5">
        {items.map((item) => {
          const tone = TONE_STYLES[item.tone]
          const Icon = item.icon
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-3 bg-white/5 hover:bg-white/8 rounded-xl px-3 py-2.5 transition"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tone.icon}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{item.title}</p>
                {item.subtitle && <p className="text-white/40 text-xs truncate">{item.subtitle}</p>}
              </div>
              <span className={`text-[10px] font-semibold rounded-full px-2 py-1 shrink-0 ${tone.badge}`}>
                {item.badge}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
