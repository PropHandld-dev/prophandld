'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveDraft, loadDraftWithTime, clearDraft } from '@/lib/formDraft'

// Hook form of lib/formDraft.ts for forms that keep their own state: the
// page passes its current value, this mirrors it to storage (debounced) and
// hands it back once, as soon as the user is known. An emptied form drops
// its draft. `restored` drives the small "picked up where you left off"
// note (see components/DraftNote.tsx).

export function useDraft<T>({
  name,
  userId,
  value,
  onRestore,
  isEmpty,
  enabled = true,
}: {
  name: string
  userId: string | null | undefined
  value: T
  onRestore: (saved: T) => void
  isEmpty: (v: T) => boolean
  enabled?: boolean
}) {
  const [restored, setRestored] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const readyFor = useRef<string | null>(null)
  const onRestoreRef = useRef(onRestore)
  const isEmptyRef = useRef(isEmpty)
  useEffect(() => {
    onRestoreRef.current = onRestore
    isEmptyRef.current = isEmpty
  })
  const key = userId ? `${name}:${userId}` : null

  useEffect(() => {
    if (!key || !enabled || readyFor.current === key) return
    readyFor.current = key
    const saved = loadDraftWithTime<T>(key)
    if (saved && !isEmptyRef.current(saved.v)) {
      onRestoreRef.current(saved.v)
      setRestored(true)
    }
  }, [key, enabled])

  useEffect(() => {
    if (!key || !enabled || readyFor.current !== key) return
    const id = setTimeout(() => {
      if (isEmptyRef.current(value)) {
        clearDraft(key)
        setSavedAt(null)
      } else {
        saveDraft(key, value)
        setSavedAt(Date.now())
      }
    }, 500)
    return () => clearTimeout(id)
  }, [key, enabled, value])

  const clear = useCallback(() => {
    if (key) clearDraft(key)
    setSavedAt(null)
    setRestored(false)
  }, [key])

  return { restored, savedAt, clear }
}
