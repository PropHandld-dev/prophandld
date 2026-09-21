'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TIME_WINDOWS } from '@/lib/scheduleWindows'

// confirmed = a time everyone has agreed on (or work that has started),
// proposed = a time waiting for the other side to confirm (also what a
// reschedule looks like until it is accepted), done = finished work, kept as
// a history.
export type CalendarEventState = 'confirmed' | 'proposed' | 'done'

export interface CalendarEvent {
  id: string
  date: string // 'YYYY-MM-DD'
  window?: string
  title: string
  subtitle?: string
  href: string
  state?: CalendarEventState
}

export function eventState(status: string, scheduleConfirmed: boolean): CalendarEventState {
  if (['pending_review', 'completed', 'archived'].includes(status)) return 'done'
  if (!scheduleConfirmed && ['bid_selected', 'scheduled'].includes(status)) return 'proposed'
  return 'confirmed'
}

// The job statuses that can carry a date worth showing.
export const CALENDAR_JOB_STATUSES = ['bid_selected', 'scheduled', 'in_progress', 'pending_review', 'completed', 'archived']

// Only the last year of history is loaded, so the calendar stays quick.
export function calendarHistoryStart() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATE_LABEL: Record<CalendarEventState, string> = { confirmed: 'Confirmed', proposed: 'Waiting for confirmation', done: 'Done' }
const CHIP_STYLE: Record<CalendarEventState, string> = {
  confirmed: 'bg-gradient-to-r from-[#0A7B7E]/25 to-[#12A5A9]/25 text-[#12A5A9]',
  proposed: 'border border-dashed border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  done: 'bg-white/5 text-white/40',
}
const BADGE_STYLE: Record<CalendarEventState, string> = {
  confirmed: 'bg-[#12A5A9]/15 text-[#12A5A9]',
  proposed: 'bg-yellow-500/15 text-yellow-400',
  done: 'bg-white/8 text-white/50',
}

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export function ScheduleCalendar({ events }: { events: CalendarEvent[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [showDone, setShowDone] = useState(true)

  const stateOf = (e: CalendarEvent): CalendarEventState => e.state ?? 'confirmed'
  const hasDone = events.some((e) => stateOf(e) === 'done')
  const visible = showDone ? events : events.filter((e) => stateOf(e) !== 'done')

  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const event of visible) {
    const list = eventsByDate.get(event.date) || []
    list.push(event)
    eventsByDate.set(event.date, list)
  }

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  const monthEvents = visible.filter((e) => e.date.startsWith(monthPrefix)).sort((a, b) => a.date.localeCompare(b.date))

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
  const windowLabel = (w?: string) => (w ? TIME_WINDOWS.find((t) => t.value === w)?.label || w : '')

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
                {dayEvents.slice(0, 2).map((event) => {
                  const state = stateOf(event)
                  return (
                    <Link
                      key={event.id}
                      href={event.href}
                      className={`block text-[10px] leading-tight rounded px-1.5 py-1 truncate hover:opacity-80 transition ${CHIP_STYLE[state]}`}
                      title={`${STATE_LABEL[state]}: ${event.subtitle ? `${event.title}, ${event.subtitle}` : event.title}`}
                    >
                      {state === 'done' ? '✓ ' : state === 'proposed' ? '? ' : ''}
                      {event.title}
                    </Link>
                  )
                })}
                {dayEvents.length > 2 && (
                  <p className="text-white/50 text-[10px] px-1.5">+{dayEvents.length - 2} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mt-4 pt-4 border-t border-white/8">
        <div className="flex items-center gap-4 text-[11px] text-white/50 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#12A5A9]/60" /> Confirmed</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-yellow-500/60" /> Waiting for confirmation</span>
          {hasDone && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/20" /> Done</span>}
        </div>
        {hasDone && (
          <button
            onClick={() => setShowDone((v) => !v)}
            className="text-white/50 hover:text-white text-xs font-medium transition"
          >
            {showDone ? 'Hide completed' : 'Show completed'}
          </button>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-2">{MONTH_LABELS[month]} at a glance</h3>
        {monthEvents.length === 0 ? (
          <p className="text-white/50 text-sm">Nothing scheduled this month.</p>
        ) : (
          <div className="space-y-1.5">
            {monthEvents.map((event) => {
              const state = stateOf(event)
              const d = new Date(event.date + 'T00:00:00')
              return (
                <Link
                  key={event.id}
                  href={event.href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white/3 border border-white/5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition"
                >
                  <div className="w-10 shrink-0 text-center">
                    <p className="text-white/50 text-[10px] uppercase">{WEEKDAY_LABELS[d.getDay()]}</p>
                    <p className={`text-base font-semibold leading-tight ${state === 'done' ? 'text-white/50' : 'text-white'}`}>{d.getDate()}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${state === 'done' ? 'text-white/60' : 'text-white'}`}>{event.title}</p>
                    <p className="text-white/50 text-xs truncate">
                      {[windowLabel(event.window), event.subtitle].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0 ${BADGE_STYLE[state]}`}>
                    {state === 'done' ? 'Done' : state === 'proposed' ? 'Waiting' : 'Confirmed'}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {events.length === 0 && (
        <p className="text-white/50 text-sm text-center mt-6">Nothing scheduled yet.</p>
      )}
    </div>
  )
}
