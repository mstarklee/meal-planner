import { z } from 'zod'
import { buildExtractionRequest } from './prompt'
import type { ExtractionInput } from './prompt'
import { fetchBlogText, fetchYoutubeText } from './extract'
import { callOpenAI } from './openai'
import { recipeDraftSchema } from '../../src/lib/recipeDraft'
import type { RecipeDraft } from '../../src/lib/recipeDraft'
import { ImportError } from './errors'

const MODEL = 'gpt-4o'

const bodySchema = z.union([
  z.object({ source: z.literal('text'), text: z.string().min(1) }),
  z.object({ source: z.literal('photo'), imageDataUrl: z.string().startsWith('data:image/') }),
  z.object({ source: z.literal('blog'), url: z.string().min(1) }),
  z.object({ source: z.literal('youtube'), url: z.string().min(1) }),
])

export async function handleImport(rawBody: unknown, apiKey: string): Promise<{ draft: RecipeDraft }> {
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) throw new ImportError('Invalid import request', 400)
  const body = parsed.data

  let input: ExtractionInput
  let linkUrl = ''
  if (body.source === 'text') input = { kind: 'text', text: body.text }
  else if (body.source === 'photo') input = { kind: 'image', imageDataUrl: body.imageDataUrl }
  else if (body.source === 'blog') { input = { kind: 'text', text: await fetchBlogText(body.url) }; linkUrl = body.url }
  else { input = { kind: 'text', text: await fetchYoutubeText(body.url) }; linkUrl = body.url }

  const raw = await callOpenAI(apiKey, buildExtractionRequest(MODEL, input))
  const result = recipeDraftSchema.safeParse({ ...(raw as object), link_url: linkUrl })
  if (!result.success) throw new ImportError('AI returned an unexpected recipe shape', 502)
  return { draft: result.data }
}
