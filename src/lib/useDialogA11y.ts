import { useEffect, useRef } from 'react'

// Shared accessible-dialog behavior — Escape to close, Tab/Shift+Tab
// contained within the dialog instead of escaping to the page behind it,
// and focus restored to whatever opened it. Extracted after fixing this
// by hand on ContactUsWidget; an external audit found the identical gap
// (no role=dialog, Escape did nothing, Tab left the popup) on several
// other popups across the app (Propose a time, the emergency
// confirmation, others) — this is meant to be the one place that logic
// lives going forward instead of being re-copied per modal.
//
// Usage: const { dialogRef, close } = useDialogA11y(open, onClose)
// then spread { ref: dialogRef, role: 'dialog', 'aria-modal': true,
// tabIndex: -1 } onto the dialog's outer element, and call `close`
// instead of the raw setState setter wherever the modal closes.
export function useDialogA11y(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    launcherRef.current = document.activeElement as HTMLElement
    const dialog = dialogRef.current
    dialog?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      launcherRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return { dialogRef }
}
