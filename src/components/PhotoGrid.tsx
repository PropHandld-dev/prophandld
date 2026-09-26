'use client'

import { useState } from 'react'
import { isVideoPath } from '@/lib/mediaValidation'

interface Photo {
  id: string
  displayUrl?: string
  photo_url?: string
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
  const [zoomed, setZoomed] = useState<{ url: string; video: boolean } | null>(null)

  const colClass = columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : 'grid-cols-3'

  const handleDelete = (e: React.MouseEvent, photo: Photo) => {
    e.stopPropagation()
    if (window.confirm(isVideoPath(photo.photo_url) ? 'Remove this video?' : 'Remove this photo?')) {
      onDelete?.(photo)
    }
  }

  return (
    <>
      <div className={`grid ${colClass} gap-2`}>
        {photos.map((p) => {
          const video = isVideoPath(p.photo_url)
          return (
            <div key={p.id} className="relative">
              <button
                type="button"
                onClick={() => p.displayUrl && setZoomed({ url: p.displayUrl, video })}
                className="block w-full"
              >
                {video ? (
                  <div className="relative">
                    <video
                      src={p.displayUrl}
                      className={`w-full ${thumbHeight} object-cover rounded-lg hover:opacity-80 transition cursor-zoom-in bg-black`}
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                        <span className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[9px] border-l-white ml-0.5" />
                      </span>
                    </span>
                  </div>
                ) : (
                  <img
                    src={p.displayUrl}
                    alt="Photo"
                    className={`w-full ${thumbHeight} object-cover rounded-lg hover:opacity-80 transition cursor-zoom-in`}
                  />
                )}
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
          )
        })}
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-30 cursor-zoom-out"
          onClick={() => setZoomed(null)}
        >
          {zoomed.video ? (
            <video
              src={zoomed.url}
              className="max-w-full max-h-full object-contain rounded-lg"
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={zoomed.url}
              alt="Zoomed photo"
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          )}
        </div>
      )}
    </>
  )
}
