import type { ComponentType, InputHTMLAttributes } from 'react'

type AuthInputProps = {
  icon?: ComponentType<{ className?: string }>
} & InputHTMLAttributes<HTMLInputElement>

export function AuthInput({ icon: Icon, className, ...props }: AuthInputProps) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
      )}
      <input
        {...props}
        className={`w-full bg-white/[0.06] border border-white/10 rounded-xl py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] focus:ring-2 focus:ring-[#12A5A9]/15 transition ${Icon ? 'pl-11 pr-4' : 'px-4'} ${className || ''}`}
      />
    </div>
  )
}
