import Link from 'next/link'
import { LegalPageShell } from '@/components/LegalPageShell'
import { RenterTermsContent } from '@/components/legal/RenterTermsContent'

export const metadata = {
  title: 'Terms of Service for Renters | Prophandld',
}

export default function RenterTermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service for Renters"
      lastUpdated="November 6, 2026"
      footerLinks={
        <>
          <Link href="/terms" className="hover:text-white transition">General Terms</Link>
          <Link href="/terms/landlord" className="hover:text-white transition">Landlord Terms</Link>
          <Link href="/terms/contractor" className="hover:text-white transition">Contractor Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </>
      }
    >
      <RenterTermsContent />
    </LegalPageShell>
  )
}
