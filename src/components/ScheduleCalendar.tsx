'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguage, t, windowLabel, WEEKDAY_LABELS_ES, MONTH_LABELS_ES, type Lang } from '@/lib/i18n'

// confirmed = a time everyone has agreed on (or work that has started),
// proposed = a time waiting for the other side to confirm (also what a
// reschedule looks like until it is accepted), done = finished work, kept as
// a history. reminder = not a job at all — something else worth knowing on
// this date (rent due, a compliance item expiring, a lease renewal coming
// up) — visually distinct so it never reads as a job that needs scheduling.
export type CalendarEventState = 'confirmed' | 'proposed' | 'done' | 'reminder'

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

const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const stateLabel = (state: CalendarEventState, lang: Lang): string => {
  if (state === 'confirmed') return t('confirmedState', lang)
  if (state === 'proposed') return t('waitingForConfirmation', lang)
  if (state === 'done') return t('doneState', lang)
  return t('reminderState', lang)
}
const CHIP_STYLE: Record<CalendarEventState, string> = {
  confirmed: 'bg-gradient-to-r from-[#0A7B7E]/25 to-[#12A5A9]/25 text-[#12A5A9]',
  proposed: 'border border-dashed border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  done: 'bg-white/5 text-white/40',
  reminder: 'border border-dashed border-orange-400/50 bg-orange-400/10 text-orange-300',
}
const BADGE_STYLE: Record<CalendarEventState, string> = {
  confirmed: 'bg-[#12A5A9]/15 text-[#12A5A9]',
  proposed: 'bg-yellow-500/15 text-yellow-400',
  done: 'bg-white/8 text-white/50',
  reminder: 'bg-orange-400/15 text-orange-300',
}

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export function ScheduleCalendar({ events }: { events: CalendarEvent[] }) {
  const lang = useLanguage()
  const WEEKDAY_LABELS = lang === 'es' ? WEEKDAY_LABELS_ES : WEEKDAY_LABELS_EN
  const MONTH_LABELS = lang === 'es' ? MONTH_LABELS_ES : MONTH_LABELS_EN
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [showDone, setShowDone] = useState(true)

  const stateOf = (e: CalendarEvent): CalendarEventState => e.state ?? 'confirmed'
  const hasDone = events.some((e) => stateOf(e) === 'done')
  const hasReminders = events.some((e) => stateOf(e) === 'reminder')
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

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-semibold">{MONTH_LABELS[month]} {year}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="text-white/50 hover:text-white text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-white/8 transition"
          >
            {t('today', lang)}
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
                      title={`${stateLabel(state, lang)}: ${event.subtitle ? `${event.title}, ${event.subtitle}` : event.title}`}
                    >
                      {state === 'done' ? '✓ ' : state === 'proposed' ? '? ' : state === 'reminder' ? '⏰ ' : ''}
                      {event.title}
                    </Link>
                  )
                })}
                {dayEvents.length > 2 && (
                  <p className="text-white/50 text-[10px] px-1.5">+{dayEvents.length - 2} {t('more', lang)}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mt-4 pt-4 border-t border-white/8">
        <div className="flex items-center gap-4 text-[11px] text-white/50 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#12A5A9]/60" /> {t('confirmedState', lang)}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-yellow-500/60" /> {t('waitingForConfirmation', lang)}</span>
          {hasReminders && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-orange-400/60" /> {t('reminderState', lang)}</span>}
          {hasDone && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/20" /> {t('doneState', lang)}</span>}
        </div>
        {hasDone && (
          <button
            onClick={() => setShowDone((v) => !v)}
            className="text-white/50 hover:text-white text-xs font-medium transition"
          >
            {showDone ? t('hideCompleted', lang) : t('showCompleted', lang)}
          </button>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-2">{MONTH_LABELS[month]} {t('monthAtAGlance', lang)}</h3>
        {monthEvents.length === 0 ? (
          <p className="text-white/50 text-sm">{t('nothingScheduledMonth', lang)}</p>
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
                      {[windowLabel(event.window, lang), event.subtitle].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0 ${BADGE_STYLE[state]}`}>
                    {state === 'done' ? t('doneState', lang) : state === 'proposed' ? t('waitingBadge', lang) : state === 'reminder' ? t('reminderState', lang) : t('confirmedState', lang)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {events.length === 0 && (
        <p className="text-white/50 text-sm text-center mt-6">{t('nothingScheduledYet', lang)}</p>
      )}
    </div>
  )
}
