import crypto from 'crypto'
import http2 from 'http2'

// Sends a native push to an iOS device via Apple's APNs provider API.
// Hand-rolled over Node's core http2 module (no third-party dependency) —
// APNs' HTTP/2 API genuinely requires an HTTP/2 connection, which the
// platform's own fetch() can't make (undici's fetch is HTTP/1.1 only), so
// this is the one native-push rail that can't just be a fetch() call like
// FCM's HTTP v1 API.
//
// Inert until APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, and APNS_BUNDLE_ID are
// all set — every call below no-ops until then, same pattern sendPush()
// already uses for the VAPID web-push keys. APNS_KEY is the full contents
// of the .p8 key file downloaded once from Apple Developer → Certificates,
// Identifiers & Profiles → Keys → (+) with "Apple Push Notifications
// service (APNs)" checked — Apple only lets you download it once, so it
// needs to be saved somewhere durable (a password manager, not just this
// env var) the moment it's generated.
let cachedProviderToken: { token: string; expiresAt: number } | null = null

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getProviderToken(): string | null {
  const key = process.env.APNS_KEY?.trim()
  const keyId = process.env.APNS_KEY_ID?.trim()
  const teamId = process.env.APNS_TEAM_ID?.trim()
  if (!key || !keyId || !teamId) return null

  // Apple caps a provider token's lifetime at 60 minutes — reusing one
  // across sends (instead of signing fresh per request) avoids needless
  // crypto work, same reasoning the FCM module caches its OAuth2 token.
  if (cachedProviderToken && cachedProviderToken.expiresAt > Date.now() + 60_000) return cachedProviderToken.token

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const payload = base64url(JSON.stringify({ iss: teamId, iat: now }))
  const signInput = `${header}.${payload}`
  // APNs wants the raw 64-byte r||s signature (IEEE P1363), not the
  // ASN.1/DER encoding crypto.sign() produces by default for EC keys —
  // confirmed against a real P-256 keypair before relying on this.
  const signature = crypto.sign('SHA256', Buffer.from(signInput), { key, dsaEncoding: 'ieee-p1363' } as crypto.SignPrivateKeyInput)
  const token = `${signInput}.${base64url(signature)}`
  cachedProviderToken = { token, expiresAt: Date.now() + 55 * 60 * 1000 }
  return token
}

export async function sendApnsPush(
  deviceToken: string,
  { title, body, url }: { title: string; body: string; url?: string }
): Promise<{ ok: boolean; invalid?: boolean }> {
  const bundleId = process.env.APNS_BUNDLE_ID?.trim()
  const providerToken = getProviderToken()
  if (!providerToken || !bundleId) return { ok: false }

  // Debug/TestFlight builds (not signed with a production push
  // entitlement) only work against the sandbox host — api.push.apple.com
  // rejects a token issued for sandbox outright. Explicit opt-in to
  // production rather than defaulting to it, so the first real push
  // attempt doesn't silently fail against the wrong host.
  const host = process.env.APNS_ENVIRONMENT === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'

  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`)
    let settled = false
    const finish = (result: { ok: boolean; invalid?: boolean }) => {
      if (settled) return
      settled = true
      client.close()
      resolve(result)
    }

    client.on('error', (err) => {
      console.error('apns: connection error', err)
      finish({ ok: false })
    })

    const payload = JSON.stringify({
      aps: { alert: { title, body }, sound: 'default' },
      ...(url ? { url } : {}),
    })

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })

    let status = 0
    let responseBody = ''
    req.on('response', (headers) => {
      status = Number(headers[':status'])
    })
    req.on('data', (chunk) => {
      responseBody += chunk
    })
    req.on('end', () => {
      if (status === 200) {
        finish({ ok: true })
        return
      }
      let reason = ''
      try {
        reason = JSON.parse(responseBody)?.reason || ''
      } catch {
        // Non-JSON body — treat as an unrecognized failure below.
      }
      const invalid = reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic'
      if (!invalid) console.error('apns: send failed', { status, reason })
      finish({ ok: false, invalid })
    })
    req.on('error', (err) => {
      console.error('apns: request error', err)
      finish({ ok: false })
    })
    req.end(payload)
  })
}
