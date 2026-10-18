'use client'

// A single input that can switch between collecting an email or a phone
// number — used everywhere an invite flow lets a landlord reach someone by
// either (co-owner, co-renter, contractor, new tenancy). Deliberately just
// the toggle + input, no submit button or error handling: each call site
// keeps its own existing submit/error UI exactly as it was, swapping only
// its single <input type="email"> for this.
export type ContactMode = 'email' | 'phone'

export function ContactInviteInput({
  mode,
  onModeChange,
  value,
  onChange,
  emailPlaceholder,
  phonePlaceholder,
  disabled,
  emailLabel = 'Email',
  phoneLabel = 'Phone',
}: {
  mode: ContactMode
  onModeChange: (mode: ContactMode) => void
  value: string
  onChange: (value: string) => void
  emailPlaceholder: string
  phonePlaceholder: string
  disabled?: boolean
  emailLabel?: string
  phoneLabel?: string
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="inline-flex bg-white/5 border border-white/10 rounded-lg p-0.5 mb-1.5">
        {(['email', 'phone'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition ${
              mode === m ? 'bg-[#12A5A9] text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {m === 'email' ? emailLabel : phoneLabel}
          </button>
        ))}
      </div>
      <input
        type={mode === 'email' ? 'email' : 'tel'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={mode === 'email' ? emailPlaceholder : phonePlaceholder}
        disabled={disabled}
        className="w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition disabled:opacity-50"
      />
    </div>
  )
}
