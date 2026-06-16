import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))

import { importRecipe } from './recipeImport'

beforeEach(() => { vi.stubEnv('VITE_IMPORT_API_URL', 'http://test.local') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('importRecipe', () => {
  it('posts the payload with a bearer token and returns the parsed draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ draft: { name: 'Soup', meal_types: ['lunch'] } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const draft = await importRecipe({ source: 'text', text: 'soup' })
    expect(draft.name).toBe('Soup')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test.local/api/import-recipe')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  it('throws the server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })))
    await expect(importRecipe({ source: 'text', text: 'x' })).rejects.toThrow('Unauthorized')
  })
})
