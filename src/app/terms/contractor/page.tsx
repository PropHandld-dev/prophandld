import Link from 'next/link'
import { LegalPageShell } from '@/components/LegalPageShell'
import { ContractorTermsContent } from '@/components/legal/ContractorTermsContent'

export const metadata = {
  title: 'Terms of Service for Contractors | Prophandld',
}

export default function ContractorTermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service for Contractors"
      lastUpdated="November 6, 2026"
      footerLinks={
        <>
          <Link href="/terms" className="hover:text-white transition">General Terms</Link>
          <Link href="/terms/landlord" className="hover:text-white transition">Landlord Terms</Link>
          <Link href="/terms/renter" className="hover:text-white transition">Renter Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </>
      }
    >
      <ContractorTermsContent />
    </LegalPageShell>
  )
}
