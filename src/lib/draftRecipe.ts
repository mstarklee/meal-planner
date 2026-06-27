import { supabase } from './supabase'
import type { RecipeDraft } from './recipeDraft'

export interface DraftRequest {
  name: string
  ingredients: Array<{ amount: string; item: string; staple?: boolean }>
}

export async function draftRecipe(req: DraftRequest): Promise<RecipeDraft> {
  // Empty/unset base => same-origin (production on Vercel). Local dev sets it to http://localhost:8787.
  const api = (import.meta.env.VITE_IMPORT_API_URL as string | undefined) ?? ''
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('You must be signed in to use this feature')
  const res = await fetch(`${api}/api/draft-recipe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? 'Could not generate a draft')
  }
  const json = (await res.json()) as { draft: RecipeDraft }
  return json.draft
}
