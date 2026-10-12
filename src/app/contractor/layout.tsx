import { requireRole } from '@/lib/roleGuard'
import { InactivityGuard } from '@/components/InactivityGuard'

export default async function ContractorLayout({ children }: { children: React.ReactNode }) {
  await requireRole('contractor')
  return (
    <>
      <InactivityGuard />
      {children}
    </>
  )
}
