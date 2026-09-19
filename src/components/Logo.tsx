export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-icon.png" alt="Prophandld" className={`${className} rounded-md`} />
}
