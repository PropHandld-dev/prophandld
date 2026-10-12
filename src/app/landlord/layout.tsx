import { requireRole } from '@/lib/roleGuard'
import { InactivityGuard } from '@/components/InactivityGuard'

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  await requireRole('landlord')
  return (
    <>
      <InactivityGuard />
      {children}
    </>
  )
}
