// page.tsx here is a client component ('use client'), which can't export
// `metadata` itself — same reason login/ and contractors/ each need their
// own thin layout too.
export const metadata = {
  title: 'Sign up | Prophandld',
  description: 'Create your free Prophandld account. Your first unit is free, full stop.',
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
