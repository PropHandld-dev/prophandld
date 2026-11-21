'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage, t } from '@/lib/i18n'
import { Skeleton } from '@/components/Skeleton'
import type { TodayTask, TodayTone } from '@/lib/todayTasks'

// "Today": the one list at the top of Home that says what to do next, in
// order, each with a single button. Built server-side by /api/today (see
// lib/todayTasks.ts) so landlord, PM, owner and tenant screens share one
// set of rules. Refreshes when the person comes back to the tab, so a task
// they just handled on another page drops off without a reload.

const INITIAL = 5

const DOT: Record<TodayTone, string> = {
  urgent: 'bg-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.15)]',
  action: 'bg-[#12A5A9] shadow-[0_0_0_4px_rgba(18,165,169,0.15)]',
  upcoming: 'bg-white/30',
}
const CTA: Record<TodayTone, string> = {
  urgent: 'bg-red-500/15 text-red-300 border-red-400/30 group-hover:bg-red-500/25',
  action: 'bg-[#12A5A9]/15 text-[#12A5A9] border-[#12A5A9]/30 group-hover:bg-[#12A5A9]/25',
  upcoming: 'bg-white/5 text-white/70 border-white/10 group-hover:bg-white/10',
}

export function TodayCard({ className = '', scopeLabel }: { className?: string; scopeLabel?: string }) {
  const lang = useLanguage()
  const [tasks, setTasks] = useState<TodayTask[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Only the newest request may update the list: the first load can start
  // before the account language is known, and its slower English answer
  // used to land after (and overwrite) the Spanish one.
  const seq = useRef(0)
  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const res = await fetch(`/api/today?lang=${lang}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      if (mine !== seq.current) return
      setTasks(body.tasks || [])
      setFailed(false)
    } catch {
      if (mine === seq.current) setFailed(true)
    }
  }, [lang])

  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const dateLine = new Date().toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })

  if (tasks === null && !failed) {
    return (
      <div className={`bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 ${className}`} aria-busy="true">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-5 w-48 mb-5" />
        <div className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
    )
  }

  if (failed && tasks === null) {
    return (
      <button
        type="button"
        onClick={load}
        className={`w-full text-left bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 hover:bg-white/5 transition ${className}`}
      >
        <p className="text-white/60 text-sm">{t('todayLoadError', lang)}</p>
        <span className="text-[#12A5A9] text-sm font-semibold mt-2 inline-block">{t('todayRetry', lang)}</span>
      </button>
    )
  }

  const list = tasks || []
  const needsYou = list.filter((x) => x.tone !== 'upcoming')
  const upcoming = list.filter((x) => x.tone === 'upcoming')
  const ordered = [...needsYou, ...upcoming]
  const visible = expanded ? ordered : ordered.slice(0, INITIAL)
  const visibleNow = visible.filter((x) => x.tone !== 'upcoming')
  const visibleLater = visible.filter((x) => x.tone === 'upcoming')

  const headline = needsYou.length === 0
    ? t('todayCaughtUp', lang)
    : needsYou.length === 1
      ? t('todayCountOne', lang)
      : t('todayCountMany', lang).replace('{n}', String(needsYou.length))

  return (
    <section
      aria-labelledby="today-heading"
      className={`relative overflow-hidden bg-white/3 border border-white/8 rounded-2xl mb-6 ${className}`}
    >
      {/* A thin light-bar along the top edge: teal when things need you, a
          calm white when it's all handled. */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-px ${needsYou.length ? 'bg-gradient-to-r from-transparent via-[#12A5A9] to-transparent' : 'bg-gradient-to-r from-transparent via-white/20 to-transparent'}`}
      />
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#12A5A9]">
            {t('todayLabel', lang)} · <span className="text-white/45 normal-case tracking-normal font-medium">{dateLine}</span>
          </p>
          <h2 id="today-heading" className="text-white text-lg font-semibold mt-1 text-balance">{headline}</h2>
          {scopeLabel && <p className="text-white/45 text-xs mt-1">{scopeLabel}</p>}
        </div>
        {needsYou.length > 0 && (
          <span
            aria-hidden="true"
            className="shrink-0 min-w-9 h-9 px-2 rounded-full grid place-items-center text-sm font-bold tabular-nums bg-[#12A5A9]/15 text-[#12A5A9] border border-[#12A5A9]/30"
          >
            {needsYou.length}
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <div className="px-5 pb-5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-emerald-500/12 text-emerald-400 grid place-items-center shrink-0" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <p className="text-white/55 text-sm">{t('todayCaughtUpDetail', lang)}</p>
        </div>
      ) : (
        <div className="pb-2">
          {visibleNow.length > 0 && <TaskGroup tasks={visibleNow} lang={lang} />}
          {visibleLater.length > 0 && (
            <>
              <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/35">{t('todayComingUp', lang)}</p>
              <TaskGroup tasks={visibleLater} lang={lang} />
            </>
          )}
          {ordered.length > INITIAL && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mx-5 my-2 text-sm font-semibold text-[#12A5A9] hover:underline"
            >
              {expanded ? t('todayShowLess', lang) : t('todayShowAll', lang).replace('{n}', String(ordered.length))}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

// "waiting 3 days" once something has sat for a day or more.
function waited(since: string | null | undefined, lang: 'en' | 'es') {
  if (!since) return null
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000)
  if (days < 1) return null
  return lang === 'es' ? `esperando ${days} día${days === 1 ? '' : 's'}` : `waiting ${days} day${days === 1 ? '' : 's'}`
}

function TaskGroup({ tasks, lang }: { tasks: TodayTask[]; lang: 'en' | 'es' }) {
  return (
    <ul className="divide-y divide-white/5">
      {tasks.map((task) => (
        <li key={task.id}>
          <Link
            href={task.href}
            className="group flex items-center gap-3.5 px-5 py-3 hover:bg-white/3 transition-colors focus-visible:outline-none focus-visible:bg-white/5"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[task.tone]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-white text-sm font-medium leading-snug">{task.title}</span>
              {(task.detail || task.waitingSince) && (
                <span className="flex items-center gap-1.5 text-white/45 text-xs mt-0.5 min-w-0">
                  {task.detail && <span className="truncate">{task.detail}</span>}
                  {waited(task.waitingSince, lang) && (
                    <span className={`shrink-0 font-medium ${task.tone === 'upcoming' ? '' : 'text-amber-300/90'}`}>
                      {task.detail ? '· ' : ''}{waited(task.waitingSince, lang)}
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className={`shrink-0 text-xs font-semibold border rounded-full px-3 py-1.5 transition-colors ${CTA[task.tone]}`}>
              {task.cta}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
