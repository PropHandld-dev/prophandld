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
  currentUserId,
  onDelete,
}: {
  photos: Photo[]
  columns?: 2 | 3 | 4
  thumbHeight?: string
  currentUserId?: string
  onDelete?: (photo: Photo) => void
}) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null)

  const colClass = columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : 'grid-cols-3'

  const handleDelete = (e: React.MouseEvent, photo: Photo) => {
    e.stopPropagation()
    if (window.confirm('Remove this photo?')) {
      onDelete?.(photo)
    }
  }

  return (
    <>
      <div className={`grid ${colClass} gap-2`}>
        {photos.map((p) => (
          <div key={p.id} className="relative">
            <button
              type="button"
              onClick={() => p.displayUrl && setZoomedUrl(p.displayUrl)}
              className="block w-full"
            >
              <img
                src={p.displayUrl}
                alt="Photo"
                className={`w-full ${thumbHeight} object-cover rounded-lg hover:opacity-80 transition cursor-zoom-in`}
              />
            </button>
            {onDelete && currentUserId && p.uploaded_by === currentUserId && (
              <button
                type="button"
                onClick={(e) => handleDelete(e, p)}
                className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/80 transition"
              >
                ×
              </button>
            )}
          </div>
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
