import type { Context } from 'hono'
import { serviceClient } from './supabaseClients'
import { sendToSubscriptions, type StoredSubscription, type PushPayload } from './push'

export type ReminderSlot = 'evening' | 'morning'

const WINDOW_MIN = 5 // must be >= the pg_cron interval

const PAYLOADS: Record<ReminderSlot, PushPayload> = {
  evening: { title: "Plan tomorrow's meals 🍽️", body: "Pick what you'll cook tomorrow.", url: '/plan' },
  morning: { title: 'Time to cook ☀️', body: "Here's today's plan.", url: '/' },
}

interface HouseholdRow {
  household_id: string
  timezone: string
  evening_reminder_time: string // 'HH:MM:SS' or 'HH:MM'
  morning_reminder_time: string
}

// Minutes-since-midnight in a given IANA timezone for an absolute instant.
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}

// 'YYYY-MM-DD' local date in a timezone (for the idempotency log).
export function localDate(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function parseHHMM(value: string): number {
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m)
}

// Returns the slot that is due "now" for this household, or null.
export function dueSlot(now: Date, row: HouseholdRow): ReminderSlot | null {
  const local = localMinutes(now, row.timezone)
  const evening = parseHHMM(row.evening_reminder_time)
  const morning = parseHHMM(row.morning_reminder_time)
  if (local >= evening && local < evening + WINDOW_MIN) return 'evening'
  if (local >= morning && local < morning + WINDOW_MIN) return 'morning'
  return null
}

export async function handleCronReminders(c: Context) {
  const secret = process.env.CRON_SECRET
  if (!secret || c.req.header('x-cron-secret') !== secret) {
    return c.json({ error: 'Forbidden' }, 401)
  }

  const svc = serviceClient()
  const now = new Date()

  const { data: households, error } = await svc
    .from('household_settings')
    .select('household_id, timezone, evening_reminder_time, morning_reminder_time')
  if (error) return c.json({ error: 'Failed to load households' }, 500)

  const rows = (households ?? []) as HouseholdRow[]
  let processed = 0
  let sent = 0
  let pruned = 0

  for (const row of rows) {
    const slot = dueSlot(now, row)
    if (!slot) continue
    const sentOn = localDate(now, row.timezone)

    // Idempotency: claim the (household, slot, day) by inserting the log row first.
    const { error: logErr } = await svc
      .from('reminder_log')
      .insert({ household_id: row.household_id, slot, sent_on: sentOn })
    if (logErr) continue // unique violation => already sent today; skip

    processed += 1

    const { data: subsData } = await svc
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('household_id', row.household_id)
    const subs = (subsData ?? []) as StoredSubscription[]
    if (subs.length === 0) continue

    const result = await sendToSubscriptions(subs, PAYLOADS[slot])
    sent += result.sent
    if (result.deadSubscriptionIds.length > 0) {
      await svc.from('push_subscriptions').delete().in('id', result.deadSubscriptionIds)
      pruned += result.deadSubscriptionIds.length
    }
  }

  return c.json({ processed, sent, pruned })
}
