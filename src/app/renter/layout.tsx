import { requireRole } from '@/lib/roleGuard'
import { InactivityGuard } from '@/components/InactivityGuard'
import { NativePushRegistration } from '@/components/NativePushRegistration'

export default async function RenterLayout({ children }: { children: React.ReactNode }) {
  await requireRole('renter')
  return (
    <>
      <InactivityGuard />
      <NativePushRegistration />
      {children}
    </>
  )
}
