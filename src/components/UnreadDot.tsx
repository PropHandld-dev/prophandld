export function UnreadDot({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full bg-[#12A5A9] ring-2 ring-[#0C1A2E] ${className || ''}`}
      aria-label="Unread messages"
    />
  )
}
