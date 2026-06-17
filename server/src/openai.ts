import type { ExtractionRequest } from './prompt'
import { ImportError } from './errors'

export async function callOpenAI(apiKey: string, req: ExtractionRequest): Promise<unknown> {
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(45_000),
    })
  } catch { throw new ImportError('Could not reach the AI service', 502) }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new ImportError(`AI request failed (${res.status})`, 502, detail.slice(0, 500))
  }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string; refusal?: string } }[] } | null
  const msg = json?.choices?.[0]?.message
  if (msg?.refusal) throw new ImportError('The AI declined to extract a recipe from this content', 422)
  const content = msg?.content
  if (!content) throw new ImportError('AI returned an empty response', 502)
  try { return JSON.parse(content) } catch { throw new ImportError('AI returned malformed JSON', 502) }
}
