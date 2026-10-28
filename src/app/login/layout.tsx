// page.tsx here is a client component ('use client'), which can't export
// `metadata` itself — App Router requires that to come from a server
// component, hence this thin layout, same reason signup/ and contractors/
// each need their own.
export const metadata = {
  title: 'Sign in | Prophandld',
  description: 'Sign in to your Prophandld account.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
