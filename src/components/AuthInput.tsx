'use client'

import { useState, type ComponentType, type InputHTMLAttributes } from 'react'
import { EyeIcon, EyeOffIcon } from '@/components/icons'

type AuthInputProps = {
  icon?: ComponentType<{ className?: string }>
} & InputHTMLAttributes<HTMLInputElement>

export function AuthInput({ icon: Icon, className, type, ...props }: AuthInputProps) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
      )}
      <input
        {...props}
        type={isPassword && visible ? 'text' : type}
        className={`w-full bg-white/[0.06] border border-white/10 rounded-xl py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] focus:ring-2 focus:ring-[#12A5A9]/15 transition ${Icon ? 'pl-11' : 'pl-4'} ${isPassword ? 'pr-11' : 'pr-4'} ${className || ''}`}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
        >
          {visible ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
        </button>
      )}
    </div>
  )
}
