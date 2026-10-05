import { requireRole } from '@/lib/roleGuard'

export default async function ContractorLayout({ children }: { children: React.ReactNode }) {
  await requireRole('contractor')
  return children
}
