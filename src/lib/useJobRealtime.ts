import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Keeps a job page in sync when another party changes the job or its
// bids. Realtime needs `jobs`/`bids` in the supabase_realtime publication
// (confirmed present), but a live re-test found postgres_changes events
// silently never arriving on an already-open tab — most likely Realtime's
// own RLS-authorization check not resolving the same way PostgREST does
// for policies that go through a SECURITY DEFINER helper (is_job_participant
// here; ChatPanel's ran into the identical gap). Until that's root-caused
// against the Realtime logs, the poll below is the actual mechanism this
// page relies on to ever notice a new bid without a manual refresh — the
// tab-focus refetch alone isn't enough for someone who never switches away.
export function useJobRealtime(jobId: string, refetch: () => void | Promise<void>) {
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => refetchRef.current(), 400)
    }

    const channel = supabase
      .channel(`job-sync:${jobId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `job_id=eq.${jobId}` }, schedule)
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', onVisible)

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refetchRef.current()
    }, 15000)

    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [jobId])
}
