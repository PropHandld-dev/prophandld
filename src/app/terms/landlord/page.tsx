import Link from 'next/link'
import { LegalPageShell } from '@/components/LegalPageShell'
import { LandlordTermsContent } from '@/components/legal/LandlordTermsContent'
import { LEGAL_UPDATED } from '@/lib/legalDates'

export const metadata = {
  title: 'Terms of Service for Landlords | Prophandld',
}

export default function LandlordTermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service for Landlords"
      lastUpdated={LEGAL_UPDATED.landlord}
      footerLinks={
        <>
          <Link href="/terms" className="hover:text-white transition">General Terms</Link>
          <Link href="/terms/renter" className="hover:text-white transition">Renter Terms</Link>
          <Link href="/terms/contractor" className="hover:text-white transition">Contractor Terms</Link>
          <Link href="/terms/property-manager" className="hover:text-white transition">Property Manager Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </>
      }
    >
      <LandlordTermsContent />
    </LegalPageShell>
  )
}
