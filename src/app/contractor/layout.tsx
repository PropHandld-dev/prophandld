import { requireRole } from '@/lib/roleGuard'
import { InactivityGuard } from '@/components/InactivityGuard'
import { NativePushRegistration } from '@/components/NativePushRegistration'

export default async function ContractorLayout({ children }: { children: React.ReactNode }) {
  await requireRole('contractor')
  return (
    <>
      <InactivityGuard />
      <NativePushRegistration />
      {children}
    </>
  )
}
