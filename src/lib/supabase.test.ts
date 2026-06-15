import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('supabase client', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('constructs when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    const mod = await import('./supabase')
    expect(mod.supabase).toBeTruthy()
    vi.unstubAllEnvs()
  })
})
