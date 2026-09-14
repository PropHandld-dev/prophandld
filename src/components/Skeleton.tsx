export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/8 rounded-lg ${className || ''}`} />
}
