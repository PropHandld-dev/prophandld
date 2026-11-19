import Link from 'next/link'
import { LegalPageShell } from '@/components/LegalPageShell'
import { PropertyManagerTermsContent } from '@/components/legal/PropertyManagerTermsContent'

export const metadata = {
  title: 'Terms for Property Managers | Prophandld',
  alternates: { canonical: '/terms/property-manager' },
}

export default function PropertyManagerTermsPage() {
  return (
    <LegalPageShell
      title="Terms for Property Managers"
      lastUpdated="November 18, 2026"
      footerLinks={
        <>
          <Link href="/terms" className="hover:text-white transition">General Terms</Link>
          <Link href="/terms/landlord" className="hover:text-white transition">Landlord Terms</Link>
          <Link href="/terms/renter" className="hover:text-white transition">Renter Terms</Link>
          <Link href="/terms/contractor" className="hover:text-white transition">Contractor Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </>
      }
    >
      <PropertyManagerTermsContent />
    </LegalPageShell>
  )
}
