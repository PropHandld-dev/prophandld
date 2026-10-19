'use client'

import { useCallback, useRef, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type ConfirmOptions = {
  title?: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

// A styled, promise-based stand-in for window.confirm() — the app's custom
// dark-navy UI used the browser's own unstyled confirm() dialog for every
// delete/cancel confirmation (21 call sites across the app), which looks
// and behaves nothing like the rest of the interface and can render
// strangely on mobile browsers. Call `await confirm({ body })` anywhere
// `window.confirm(message)` was used — same "resolves to true/false"
// shape — and render `{ConfirmDialog}` once, anywhere in the component's
// JSX, so it has somewhere to mount.
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)
  const lang = useLanguage()

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const resolve = (value: boolean) => {
    setOptions(null)
    resolver.current?.(value)
    resolver.current = null
  }

  const ConfirmDialog = options ? (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50">
      <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
        {options.title && <h3 className="text-white font-semibold mb-2">{options.title}</h3>}
        <p className="text-white/70 text-sm leading-relaxed mb-6">{options.body}</p>
        <div className="flex items-center gap-3">
          <RippleButton
            onClick={() => resolve(true)}
            className={`flex-1 text-sm font-semibold py-2.5 rounded-xl transition ${
              options.danger
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white hover:opacity-90'
            }`}
          >
            {options.confirmLabel || t('confirmBtn', lang)}
          </RippleButton>
          <button
            type="button"
            onClick={() => resolve(false)}
            className="flex-1 text-white/60 hover:text-white text-sm font-semibold py-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition"
          >
            {options.cancelLabel || t('cancel', lang)}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, ConfirmDialog }
}
