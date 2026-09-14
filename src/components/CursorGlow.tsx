'use client'

import { useEffect, useRef } from 'react'

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame: number | null = null
    let x = window.innerWidth / 2
    let y = window.innerHeight / 3

    const apply = () => {
      frame = null
      ref.current?.style.setProperty('--glow-x', `${x}px`)
      ref.current?.style.setProperty('--glow-y', `${y}px`)
    }

    const handleMove = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      if (frame === null) frame = requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', handleMove)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 hidden sm:block"
      style={{
        background:
          'radial-gradient(600px circle at var(--glow-x, 50vw) var(--glow-y, 33vh), rgba(18,165,169,0.15), transparent 70%)',
        mixBlendMode: 'screen',
      }}
    />
  )
}
