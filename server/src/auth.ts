import { anonClient } from './supabaseClients'

// Verifies a Supabase access token and returns the user id, or null if invalid.
export async function verifySupabaseToken(token: string): Promise<string | null> {
  if (!token) return null
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
