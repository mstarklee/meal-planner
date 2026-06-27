import { supabase } from './supabase'
import type { ActivityLevel } from './nutritionTargets'

export interface AssistAnswers {
  trainsPerWeek: number
  goal: 'maintain' | 'build_muscle' | 'lose_fat'
}

export async function suggestActivity(answers: AssistAnswers): Promise<{ level: ActivityLevel; why: string }> {
  // Empty/unset base => same-origin (production on Vercel). Local dev sets it to http://localhost:8787.
  const api = (import.meta.env.VITE_IMPORT_API_URL as string | undefined) ?? ''
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('You must be signed in to use this feature')
  const res = await fetch(`${api}/api/suggest-activity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(answers),
  })
  if (!res.ok) throw new Error('Could not get a suggestion')
  return res.json() as Promise<{ level: ActivityLevel; why: string }>
}
