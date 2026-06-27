import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { handleImport } from './importHandler'
import { handleDraftRecipe } from './draftHandler'
import { verifySupabaseToken } from './auth'
import { ImportError } from './errors'
import { handleSuggestActivity } from './suggestActivity'
import { handleSubscribe } from './subscribe'
import { handleCronReminders } from './reminders'

export const app = new Hono().basePath('/api')

// CORS is only needed for the split local-dev setup (frontend :5173 → server :8787).
// In production the app is same-origin, so this is a no-op.
const allowedOrigin = process.env.ALLOWED_ORIGIN
if (allowedOrigin) {
  app.use('*', cors({
    origin: allowedOrigin,
    allowHeaders: ['authorization', 'content-type'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
  }))
}

app.get('/health', (c) => c.json({ ok: true }))

app.post('/import-recipe', async (c) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return c.json({ error: 'Server is missing OPENAI_API_KEY' }, 500)

  const authz = c.req.header('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  const userId = await verifySupabaseToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json().catch(() => null)
    return c.json(await handleImport(body, apiKey))
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, err.status as ContentfulStatusCode)
    return c.json({ error: 'Import failed' }, 500)
  }
})

app.post('/draft-recipe', async (c) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return c.json({ error: 'Server is missing OPENAI_API_KEY' }, 500)

  const authz = c.req.header('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  const userId = await verifySupabaseToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json().catch(() => null)
    return c.json(await handleDraftRecipe(body, apiKey))
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, err.status as ContentfulStatusCode)
    return c.json({ error: 'Draft failed' }, 500)
  }
})

app.post('/suggest-activity', async (c) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return c.json({ error: 'Server is missing OPENAI_API_KEY' }, 500)
  const authz = c.req.header('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  const userId = await verifySupabaseToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const body = await c.req.json().catch(() => null)
    return c.json(await handleSuggestActivity(body, apiKey))
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, err.status as ContentfulStatusCode)
    return c.json({ error: 'Suggestion failed' }, 500)
  }
})

app.post('/push/subscribe', handleSubscribe)
app.post('/cron/reminders', handleCronReminders)
