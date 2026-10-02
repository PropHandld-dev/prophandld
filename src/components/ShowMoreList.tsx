'use client'

import { useState, Fragment } from 'react'
import { useLanguage, t } from '@/lib/i18n'

export function ShowMoreList<T>({
  items,
  initialCount = 5,
  renderItem,
  itemKey,
}: {
  items: T[]
  initialCount?: number
  renderItem: (item: T) => React.ReactNode
  itemKey: (item: T) => string
}) {
  const lang = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, initialCount)

  return (
    <>
      {visible.map((item) => (
        <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>
      ))}
      {items.length > initialCount && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-center text-[#12A5A9] text-xs font-semibold py-3 hover:underline"
        >
          {expanded ? t('showLess', lang) : `${t('showAllPrefix', lang)}${items.length}${t('showAllSuffix', lang)}`}
        </button>
      )}
    </>
  )
}
