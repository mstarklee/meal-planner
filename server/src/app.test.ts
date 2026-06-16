import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./auth', () => ({ verifySupabaseToken: vi.fn() }))
vi.mock('./importHandler', () => ({ handleImport: vi.fn() }))

import { app } from './app'
import { verifySupabaseToken } from './auth'
import { handleImport } from './importHandler'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'test-key'
})

function post(headers: Record<string, string>) {
  return app.request('/api/import-recipe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ source: 'text', text: 'x' }),
  })
}

describe('POST /api/import-recipe', () => {
  it('401s without a valid token', async () => {
    vi.mocked(verifySupabaseToken).mockResolvedValue(null)
    const res = await post({})
    expect(res.status).toBe(401)
    expect(handleImport).not.toHaveBeenCalled()
  })

  it('returns the draft for an authorized caller', async () => {
    vi.mocked(verifySupabaseToken).mockResolvedValue('u1')
    vi.mocked(handleImport).mockResolvedValue({ draft: { name: 'Soup' } } as never)
    const res = await post({ authorization: 'Bearer good' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ draft: { name: 'Soup' } })
  })
})

describe('GET /health', () => {
  it('responds ok', async () => {
    const res = await app.request('/health')
    expect(await res.json()).toEqual({ ok: true })
  })
})
