'use client'

import { useState } from 'react'

interface Photo {
  id: string
  displayUrl?: string
  [key: string]: any
}

export function PhotoGrid({
  photos,
  columns = 3,
  thumbHeight = 'h-24',
}: {
  photos: Photo[]
  columns?: 2 | 3 | 4
  thumbHeight?: string
}) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null)

  const colClass = columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : 'grid-cols-3'

  return (
    <>
      <div className={`grid ${colClass} gap-2`}>
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => p.displayUrl && setZoomedUrl(p.displayUrl)}
            className="block"
          >
            <img
              src={p.displayUrl}
              alt="Photo"
              className={`w-full ${thumbHeight} object-cover rounded-lg hover:opacity-80 transition cursor-zoom-in`}
            />
          </button>
        ))}
      </div>

      {zoomedUrl && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-30 cursor-zoom-out"
          onClick={() => setZoomedUrl(null)}
        >
          <img
            src={zoomedUrl}
            alt="Zoomed photo"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  )
}
