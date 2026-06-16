import { supabase } from './supabase'
import { recipeDraftSchema } from './recipeDraft'
import type { RecipeDraft } from './recipeDraft'

export type ImportPayload =
  | { source: 'text'; text: string }
  | { source: 'photo'; imageDataUrl: string }
  | { source: 'blog'; url: string }
  | { source: 'youtube'; url: string }

export async function importRecipe(payload: ImportPayload): Promise<RecipeDraft> {
  const api = import.meta.env.VITE_IMPORT_API_URL as string | undefined
  if (!api) throw new Error('Import is not configured (VITE_IMPORT_API_URL missing)')
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('You must be signed in to import')

  const res = await fetch(`${api}/api/import-recipe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = (await res.json().catch(() => null)) as { draft?: unknown; error?: string } | null
  if (!res.ok) throw new Error(json?.error ?? `Import failed (${res.status})`)
  const parsed = recipeDraftSchema.safeParse(json?.draft)
  if (!parsed.success) throw new Error('Got an unexpected response from the import service')
  return parsed.data
}
