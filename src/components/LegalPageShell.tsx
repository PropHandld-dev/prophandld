import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'

// Shared shell for every legal/policy page (terms, privacy, the per-role
// terms pages, sms-consent) — same nav/footer markup those pages already
// each wrote out independently. Plain server component, no interactivity,
// so it composes cleanly under each page's own `export const metadata`.
export function LegalPageShell({
  title,
  lastUpdated,
  footerLinks,
  children,
}: {
  title: string
  lastUpdated: string
  footerLinks?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <Link href="/" className="text-sm text-white/50 hover:text-white transition">← Back home</Link>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-white/60 text-sm mb-12">Last updated {lastUpdated}</p>

        <div className="space-y-10 text-white/60 text-sm leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between flex-wrap gap-y-2 text-sm text-white/60">
          <span>© 2026 Prophandld LLC</span>
          <div className="flex items-center gap-4 flex-wrap">{footerLinks}</div>
        </div>
      </footer>
    </div>
  )
}
