'use client'

import { useState } from 'react'
import Link from 'next/link'

export interface CalendarEvent {
  id: string
  date: string // 'YYYY-MM-DD'
  window?: string
  title: string
  subtitle?: string
  href: string
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export function ScheduleCalendar({ events }: { events: CalendarEvent[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const list = eventsByDate.get(event.date) || []
    list.push(event)
    eventsByDate.set(event.date, list)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = new Date(year, month, 1).getDay()
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7

  const cells: { day: number | null; key: string | null }[] = []
  for (let i = 0; i < totalCells; i++) {
    const day = i - startWeekday + 1
    if (day < 1 || day > daysInMonth) {
      cells.push({ day: null, key: null })
    } else {
      cells.push({ day, key: dateKey(year, month, day) })
    }
  }

  const goToPrevMonth = () => {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  const goToNextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  const goToToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-semibold">{MONTH_LABELS[month]} {year}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="text-white/50 hover:text-white text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-white/8 transition"
          >
            Today
          </button>
          <button
            onClick={goToPrevMonth}
            aria-label="Previous month"
            className="text-white/50 hover:text-white w-7 h-7 rounded-lg hover:bg-white/8 transition flex items-center justify-center"
          >
            ←
          </button>
          <button
            onClick={goToNextMonth}
            aria-label="Next month"
            className="text-white/50 hover:text-white w-7 h-7 rounded-lg hover:bg-white/8 transition flex items-center justify-center"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-white/50 text-xs font-medium text-center py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (cell.day === null) {
            return <div key={i} className="min-h-20 rounded-lg" />
          }
          const dayEvents = eventsByDate.get(cell.key!) || []
          const isToday = cell.key === todayKey
          return (
            <div
              key={i}
              className={`min-h-20 rounded-lg p-1.5 border ${isToday ? 'border-[#12A5A9]/40 bg-[#12A5A9]/5' : 'border-white/5'}`}
            >
              <p className={`text-xs mb-1 ${isToday ? 'text-[#12A5A9] font-semibold' : 'text-white/60'}`}>
                {cell.day}
              </p>
              <div className="space-y-1">
                {dayEvents.slice(0, 2).map((event) => (
                  <Link
                    key={event.id}
                    href={event.href}
                    className="block bg-gradient-to-r from-[#0A7B7E]/25 to-[#12A5A9]/25 text-[#12A5A9] text-[10px] leading-tight rounded px-1.5 py-1 truncate hover:opacity-80 transition"
                    title={event.subtitle ? `${event.title}: ${event.subtitle}` : event.title}
                  >
                    {event.title}
                  </Link>
                ))}
                {dayEvents.length > 2 && (
                  <p className="text-white/50 text-[10px] px-1.5">+{dayEvents.length - 2} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {events.length === 0 && (
        <p className="text-white/50 text-sm text-center mt-6">No confirmed schedules yet.</p>
      )}
    </div>
  )
}
