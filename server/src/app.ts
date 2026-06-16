import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { handleImport } from './importHandler'
import { verifySupabaseToken } from './auth'
import { ImportError } from './errors'

export const app = new Hono()

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'

app.use('*', cors({
  origin: ALLOWED_ORIGIN,
  allowHeaders: ['authorization', 'content-type'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
}))

app.get('/health', (c) => c.json({ ok: true }))

app.post('/api/import-recipe', async (c) => {
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
