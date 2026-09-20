import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Keeps a job page in sync when another party changes the job or its
// bids. Realtime needs `jobs`/`bids` in the supabase_realtime publication;
// the tab-focus refetch works without it, so the page still self-heals
// when someone comes back to a tab that's been sitting open.
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

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [jobId])
}
