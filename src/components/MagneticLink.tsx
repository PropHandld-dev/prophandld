'use client'

import Link from 'next/link'
import { useRef, type MouseEvent } from 'react'

type Props = {
  href: string
  className?: string
  children: React.ReactNode
}

export function MagneticLink({ href, className, children }: Props) {
  const ref = useRef<HTMLAnchorElement>(null)

  const handleMove = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current
    if (!el || window.matchMedia('(pointer: coarse)').matches) return
    const rect = el.getBoundingClientRect()
    const relX = e.clientX - rect.left - rect.width / 2
    const relY = e.clientY - rect.top - rect.height / 2
    el.style.transform = `translate(${relX * 0.25}px, ${relY * 0.25}px)`
  }

  const handleLeave = () => {
    if (ref.current) ref.current.style.transform = 'translate(0, 0)'
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2.5
    const ripple = document.createElement('span')
    ripple.style.position = 'absolute'
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`
    ripple.style.width = `${size}px`
    ripple.style.height = `${size}px`
    ripple.style.borderRadius = '9999px'
    ripple.style.background = 'radial-gradient(circle, rgba(255,255,255,0.5), transparent 70%)'
    ripple.style.pointerEvents = 'none'
    ripple.className = 'magnetic-ripple'
    el.appendChild(ripple)
    ripple.addEventListener('animationend', () => ripple.remove())
  }

  return (
    <Link
      ref={ref}
      href={href}
      className={`relative overflow-hidden inline-block transition-all duration-200 ease-out ${className || ''}`}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      {children}
    </Link>
  )
}
