import webpush from 'web-push'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { isPreviewDeployment } from '@/lib/env'

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@prophandld.com').trim()
  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey)
  }
  configured = true
}

export async function sendPush(userId: string, { title, body, url }: { title: string; body: string; url?: string }) {
  if (isPreviewDeployment()) return
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return
  ensureConfigured()

  const supabaseAdmin = getSupabaseAdmin()
  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', userId)

  if (error) {
    console.error('sendPush: error fetching subscriptions', { userId, error })
    return
  }
  if (!subscriptions || subscriptions.length === 0) return

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          JSON.stringify({ title, body, url: url || '/' })
        )
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('sendPush: send failed', { userId, endpoint: sub.endpoint, err })
        }
      }
    })
  )
}
