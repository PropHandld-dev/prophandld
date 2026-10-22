import { requireRole } from '@/lib/roleGuard'
import { InactivityGuard } from '@/components/InactivityGuard'
import { NativePushRegistration } from '@/components/NativePushRegistration'

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  await requireRole('landlord')
  return (
    <>
      <InactivityGuard />
      <NativePushRegistration />
      {children}
    </>
  )
}
