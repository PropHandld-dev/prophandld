'use client'

import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

// Drop-in replacement for <input type="password">, same props, with a
// show/hide toggle — the one thing a plain password input can't do.
export function PasswordInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false)
  const lang = useLanguage()

  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className || ''} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? t('hidePasswordAriaLabel', lang) : t('showPasswordAriaLabel', lang)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
      >
        {visible ? <EyeOffIcon className="w-[18px] h-[18px]" /> : <EyeIcon className="w-[18px] h-[18px]" />}
      </button>
    </div>
  )
}
