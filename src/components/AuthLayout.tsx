import { Logo } from '@/components/Logo'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CheckCircleIcon } from '@/components/icons'

const DEFAULT_CHECKLIST = ['Sealed bidding', 'No surprise costs', 'Photo-verified work']

export function AuthLayout({
  headline,
  subtext,
  showChecklist = false,
  checklist = DEFAULT_CHECKLIST,
  children,
}: {
  headline: string
  subtext: string
  showChecklist?: boolean
  checklist?: string[]
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#0C1A2E] lg:flex">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex lg:w-[42%] xl:w-[38%] flex-col justify-between p-12 relative overflow-hidden border-r border-white/8">
        <div aria-hidden className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-[#0A7B7E]/25 blur-3xl motion-safe:animate-[drift_9s_ease-in-out_infinite]" />
        <div aria-hidden className="absolute bottom-0 -right-16 w-72 h-72 rounded-full bg-[#12A5A9]/20 blur-3xl motion-safe:animate-[drift_11s_ease-in-out_infinite_1s]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <Logo className="w-8 h-8" />
            <span className="font-bold text-lg tracking-tight text-white">Prophandld</span>
          </div>
          <p className="text-white/50 text-xs mt-1 tracking-wide">Your Property. Handled.</p>
        </div>

        <div className="relative">
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">{headline}</h2>
          <p className="text-white/50 text-base leading-relaxed max-w-sm">{subtext}</p>

          {showChecklist && (
            <ul className="mt-8 space-y-3">
              {checklist.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-white/70 text-sm">
                  <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="relative text-white/50 text-xs">© 2026 Prophandld</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 relative overflow-hidden">
        <div aria-hidden className="lg:hidden absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#0A7B7E]/20 blur-3xl -z-10 motion-safe:animate-[drift_9s_ease-in-out_infinite]" />
        <div aria-hidden className="lg:hidden absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-[#12A5A9]/20 blur-3xl -z-10 motion-safe:animate-[drift_11s_ease-in-out_infinite_1s]" />

        <ScrollReveal className="w-full max-w-sm">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="flex items-center gap-2.5">
              <Logo className="w-8 h-8" />
              <span className="font-bold text-lg tracking-tight text-white">Prophandld</span>
            </div>
            <p className="text-white/50 text-xs mt-1 tracking-wide">Your Property. Handled.</p>
          </div>
          {children}
        </ScrollReveal>
      </div>
    </div>
  )
}
