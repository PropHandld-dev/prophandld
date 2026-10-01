import Twilio from 'twilio'
import { isPreviewDeployment } from '@/lib/env'

let twilioClient: ReturnType<typeof Twilio> | null = null

function getTwilioClient() {
  if (!twilioClient) {
    // .trim() here for the same reason it's on the Stripe client — a
    // trailing newline/space from pasting into Vercel's env var UI is a
    // real, already-confirmed failure mode (it silently broke every
    // Stripe call in production), and these credentials are set the
    // exact same way.
    twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID!.trim(), process.env.TWILIO_AUTH_TOKEN!.trim())
  }
  return twilioClient
}

export async function sendSms(to: string, body: string) {
  if (isPreviewDeployment()) {
    console.log('[staging] sms suppressed', { to })
    return { ok: true, id: 'suppressed-on-preview' }
  }
  if (!process.env.TWILIO_ACCOUNT_SID?.trim() || !process.env.TWILIO_AUTH_TOKEN?.trim() || !process.env.TWILIO_PHONE_NUMBER?.trim()) {
    return { ok: false, error: 'SMS not configured' }
  }
  try {
    const message = await getTwilioClient().messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER.trim(),
      body,
    })
    return { ok: true, id: message.sid }
  } catch (err) {
    console.error('Failed to send SMS to', to, err)
    return { ok: false, error: err }
  }
}
