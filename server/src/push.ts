import webpush from 'web-push'

export interface StoredSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export interface SendResult {
  sent: number
  deadSubscriptionIds: string[]
}

// Sends a payload to every subscription; returns ids of subscriptions that are gone (404/410).
export async function sendToSubscriptions(
  subs: StoredSubscription[],
  payload: PushPayload,
): Promise<SendResult> {
  if (!ensureConfigured()) throw new Error('VAPID env not configured')
  const body = JSON.stringify(payload)
  const dead: string[] = []
  let sent = 0

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id)
        // other errors (429/5xx) are transient — leave the subscription in place
      }
    }),
  )

  return { sent, deadSubscriptionIds: dead }
}
