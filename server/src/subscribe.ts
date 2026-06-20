import type { Context } from 'hono'
import { verifySupabaseToken } from './auth'
import { clientForToken, serviceClient } from './supabaseClients'

interface SubscribeBody {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export async function handleSubscribe(c: Context) {
  const authz = c.req.header('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  const userId = await verifySupabaseToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as SubscribeBody | null
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: 'Invalid subscription' }, 400)
  }

  // Resolve the caller's household via their JWT (RLS applies -> only their own profile).
  const userClient = clientForToken(token)
  const { data: profile, error: profileErr } = await userClient
    .from('profiles').select('household_id').eq('id', userId).single()
  const householdId = (profile as { household_id: string | null } | null)?.household_id
  if (profileErr || !householdId) return c.json({ error: 'No household' }, 400)

  // Upsert per-device (endpoint is unique). Use service role so an endpoint that moved
  // between users/households is reassigned cleanly.
  const svc = serviceClient()
  const { error } = await svc.from('push_subscriptions').upsert(
    {
      household_id: householdId,
      user_id: userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) return c.json({ error: 'Failed to save subscription' }, 500)

  return c.json({ ok: true })
}
