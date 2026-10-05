import { requireRole } from '@/lib/roleGuard'

export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  await requireRole('landlord')
  return children
}
