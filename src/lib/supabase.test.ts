import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('supabase client', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('constructs when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
    const mod = await import('./supabase')
    expect(mod.supabase).toBeTruthy()
    vi.unstubAllEnvs()
  })
})
