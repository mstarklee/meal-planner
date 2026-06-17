import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env')
const supabase = createClient(url, anonKey)

// Verifies a Supabase access token and returns the user id, or null if invalid.
export async function verifySupabaseToken(token: string): Promise<string | null> {
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
