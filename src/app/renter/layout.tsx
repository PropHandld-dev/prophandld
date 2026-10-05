import { requireRole } from '@/lib/roleGuard'

export default async function RenterLayout({ children }: { children: React.ReactNode }) {
  await requireRole('renter')
  return children
}
