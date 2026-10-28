// page.tsx here is a client component ('use client'), which can't export
// `metadata` itself — same reason login/ and signup/ each need their own
// thin layout too.
export const metadata = {
  title: 'For Contractors | Prophandld',
  description: 'Real local maintenance jobs, sent straight to your phone for your trade. Submit a sealed bid and get picked on merit. No signup fee, no monthly fee, no cut of your bid, free during this pilot program.',
}

export default function ContractorsLayout({ children }: { children: React.ReactNode }) {
  return children
}
