'use client'

import { useRef, type ButtonHTMLAttributes, type MouseEvent } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement>

export function RippleButton({ className, onClick, children, ...rest }: Props) {
  const ref = useRef<HTMLButtonElement>(null)

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const el = ref.current
    if (el) {
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
    onClick?.(e)
  }

  return (
    <button
      ref={ref}
      className={`relative overflow-hidden ${className || ''}`}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </button>
  )
}
