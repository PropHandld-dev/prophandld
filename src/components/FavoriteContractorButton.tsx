'use client'

import { useState } from 'react'
import { useLanguage, t } from '@/lib/i18n'

export function FavoriteContractorButton({
  contractorUserId,
  isFavorited,
  onChange,
}: {
  contractorUserId: string
  isFavorited: boolean
  onChange: (favorited: boolean) => void
}) {
  const lang = useLanguage()
  const [saving, setSaving] = useState(false)

  const toggle = async () => {
    if (saving) return
    setSaving(true)
    const next = !isFavorited
    try {
      const res = await fetch('/api/landlord/favorite-contractors', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractorUserId }),
      })
      if (res.ok) onChange(next)
    } catch (err) {
      console.error('Error toggling favorite contractor:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      title={isFavorited ? t('removeFromMyContractors', lang) : t('addToMyContractors', lang)}
      aria-label={isFavorited ? t('removeFromMyContractors', lang) : t('addToMyContractors', lang)}
      className={`text-base leading-none transition disabled:opacity-50 ${
        isFavorited ? 'text-yellow-400' : 'text-white/30 hover:text-yellow-400'
      }`}
    >
      {isFavorited ? '★' : '☆'}
    </button>
  )
}
