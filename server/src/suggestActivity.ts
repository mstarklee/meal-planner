import { ImportError } from './errors'

const LEVELS = ['sedentary', 'moderate', 'strength', 'fat_loss'] as const
export type ActivityLevel = (typeof LEVELS)[number]

export interface AssistAnswers {
  trainsPerWeek: number   // sessions/week
  goal: 'maintain' | 'build_muscle' | 'lose_fat'
}

// Deterministic rule used both as the fallback and to validate the model's choice.
export function ruleBasedLevel(a: AssistAnswers): ActivityLevel {
  if (a.goal === 'lose_fat') return 'fat_loss'
  if (a.goal === 'build_muscle' || a.trainsPerWeek >= 3) return 'strength'
  if (a.trainsPerWeek >= 1) return 'moderate'
  return 'sedentary'
}

export function coerceLevel(value: unknown, fallback: ActivityLevel): ActivityLevel {
  return (LEVELS as readonly string[]).includes(value as string) ? (value as ActivityLevel) : fallback
}

export async function handleSuggestActivity(body: unknown, apiKey: string): Promise<{ level: ActivityLevel; why: string }> {
  const a = body as Partial<AssistAnswers> | null
  if (!a || typeof a.trainsPerWeek !== 'number' || !a.goal) {
    throw new ImportError('Missing trainsPerWeek or goal', 400)
  }
  const answers: AssistAnswers = { trainsPerWeek: a.trainsPerWeek, goal: a.goal }
  const fallback = ruleBasedLevel(answers)

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You map a person to one protein/activity level. Reply JSON {"level": one of sedentary|moderate|strength|fat_loss, "why": short sentence}.' },
          { role: 'user', content: `Trains ${answers.trainsPerWeek}x/week. Goal: ${answers.goal}.` },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch { return { level: fallback, why: 'Suggested from your answers.' } }
  if (!res.ok) return { level: fallback, why: 'Suggested from your answers.' }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null
  const content = json?.choices?.[0]?.message?.content
  try {
    const parsed = JSON.parse(content ?? '{}') as { level?: unknown; why?: unknown }
    return { level: coerceLevel(parsed.level, fallback), why: typeof parsed.why === 'string' ? parsed.why : 'Suggested from your answers.' }
  } catch {
    return { level: fallback, why: 'Suggested from your answers.' }
  }
}
