// Small reusable form-field label with an optional Spanish subtitle —
// the lightweight translation approach: keep English primary, help
// Spanish-speaking contractors on the screens where a misunderstanding
// has real consequences (pricing, bidding), without a full i18n system.
export function FieldLabel({ children, es }: { children: React.ReactNode; es?: string }) {
  return (
    <label className="block mb-1">
      <span className="text-white/70 text-sm block">{children}</span>
      {es && <span className="text-white/50 text-xs block">{es}</span>}
    </label>
  )
}
