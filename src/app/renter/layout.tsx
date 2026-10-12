import { requireRole } from '@/lib/roleGuard'
import { InactivityGuard } from '@/components/InactivityGuard'

export default async function RenterLayout({ children }: { children: React.ReactNode }) {
  await requireRole('renter')
  return (
    <>
      <InactivityGuard />
      {children}
    </>
  )
}
