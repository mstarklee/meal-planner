import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY

if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env')

// Anonymous client (no user context) — used only for token verification.
export const anonClient: SupabaseClient = createClient(url, anonKey)

// A client scoped to a specific user's JWT, so RLS policies apply as that user.
export function clientForToken(token: string): SupabaseClient {
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Service-role client — bypasses RLS. Used ONLY by the cron route (server-side, trusted).
// Throws lazily so dev without the key still runs non-cron routes.
export function serviceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env')
  return createClient(url!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}
