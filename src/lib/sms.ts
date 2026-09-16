import Twilio from 'twilio'

let twilioClient: ReturnType<typeof Twilio> | null = null

function getTwilioClient() {
  if (!twilioClient) {
    twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  }
  return twilioClient
}

export async function sendSms(to: string, body: string) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return { ok: false, error: 'SMS not configured' }
  }
  try {
    const message = await getTwilioClient().messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      body,
    })
    return { ok: true, id: message.sid }
  } catch (err) {
    console.error('Failed to send SMS to', to, err)
    return { ok: false, error: err }
  }
}
