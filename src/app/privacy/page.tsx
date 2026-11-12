import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BackHomeLink } from '@/components/BackHomeLink'
import { PrivacyContent } from '@/components/legal/PrivacyContent'

export const metadata = {
  title: 'Privacy Policy | Prophandld',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <BackHomeLink className="text-sm text-white/50 hover:text-white transition" />
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-white/60 text-sm mb-12">Last updated November 6, 2026</p>

        <div className="space-y-10 text-white/60 text-sm leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">

          <PrivacyContent />

        </div>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between text-sm text-white/60">
          <span>© 2026 Prophandld LLC</span>
          <Link href="/terms" className="hover:text-white transition">Terms of Service</Link>
        </div>
      </footer>
    </div>
  )
}
