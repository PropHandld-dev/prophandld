'use client'

import { useEffect, useRef, useState } from 'react'

export function ScrollReveal({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)

    // Confirmed in testing: content that mounts already inside the
    // viewport (common for anything near the top of a page, especially
    // once it fills in after an async data load) can end up permanently
    // stuck at opacity-0 — the landlord dashboard's own property list did
    // exactly this, rendering as blank space where real data should have
    // been. A reveal animation should never be able to hide real content
    // forever, so this is a hard backstop regardless of why the observer
    // didn't fire.
    const fallback = setTimeout(() => setVisible(true), 1200)

    return () => {
      observer.disconnect()
      clearTimeout(fallback)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className || ''}`}
      {...rest}
    >
      {children}
    </div>
  )
}
