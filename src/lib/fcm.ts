import crypto from 'crypto'

// Sends a native push to an Android device via Firebase Cloud Messaging's
// HTTP v1 API. Hand-rolled (no firebase-admin dependency) since the only
// thing actually needed is a short-lived OAuth2 access token exchanged
// from a service account's RS256-signed JWT — the same token-exchange
// shape as any Google service account, nothing FCM-specific about it.
//
// Inert until FCM_SERVICE_ACCOUNT_JSON is set (the full service account
// JSON key, downloaded from Firebase Console → Project Settings → Service
// Accounts → Generate new private key) — every call below no-ops until
// then, same pattern sendPush() already uses for the VAPID web-push keys.
let cachedToken: { token: string; expiresAt: number } | null = null

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getServiceAccount(): { client_email: string; private_key: string; project_id: string } | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error('fcm: FCM_SERVICE_ACCOUNT_JSON is not valid JSON', err)
    return null
  }
}

async function getAccessToken(serviceAccount: { client_email: string; private_key: string }): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )
  const signInput = `${header}.${payload}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signInput), serviceAccount.private_key)
  const assertion = `${signInput}.${base64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) {
    console.error('fcm: OAuth2 token exchange failed', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return cachedToken.token
}

// `invalid: true` tells the caller (sendPush) to delete the stored token —
// same "this subscription is dead, stop trying it" signal web-push's
// 404/410 status already gives.
export async function sendFcmPush(
  token: string,
  { title, body, url }: { title: string; body: string; url?: string }
): Promise<{ ok: boolean; invalid?: boolean }> {
  const serviceAccount = getServiceAccount()
  if (!serviceAccount) return { ok: false }

  const accessToken = await getAccessToken(serviceAccount)
  if (!accessToken) return { ok: false }

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        ...(url ? { data: { url } } : {}),
        android: { priority: 'high' },
      },
    }),
  })
  if (res.ok) return { ok: true }

  const errBody = await res.json().catch(() => ({}) as any)
  const errorCode = errBody?.error?.details?.find((d: any) => d['@type']?.includes('ErrorInfo'))?.errorCode
  const invalid = errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT' || errBody?.error?.status === 'NOT_FOUND'
  if (!invalid) console.error('fcm: send failed', res.status, errBody)
  return { ok: false, invalid }
}
