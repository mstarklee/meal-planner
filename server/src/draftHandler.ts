import { z } from 'zod'
import { buildDraftRequest } from './prompt'
import { callOpenAI } from './openai'
import { recipeDraftSchema } from '../../src/lib/recipeDraft'
import type { RecipeDraft } from '../../src/lib/recipeDraft'
import { ImportError } from './errors'

const MODEL = 'gpt-4o'

const bodySchema = z.object({
  name: z.string().max(200).optional().default(''),
  ingredients: z
    .array(z.object({
      amount: z.string().max(100).default(''),
      item: z.string().max(200),
      staple: z.boolean().optional(),
    }))
    .max(100),
})

export async function handleDraftRecipe(rawBody: unknown, apiKey: string): Promise<{ draft: RecipeDraft }> {
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) throw new ImportError('Invalid draft request', 400)
  const body = parsed.data

  // Keep only ingredients that name something; the user's rows are the source of truth.
  const ingredients = body.ingredients.filter((i) => i.item.trim() !== '')
  if (ingredients.length === 0) throw new ImportError('Add at least one ingredient first', 400)

  const raw = await callOpenAI(apiKey, buildDraftRequest(MODEL, { name: body.name, ingredients }))
  const result = recipeDraftSchema.safeParse(raw)
  if (!result.success) throw new ImportError('AI returned an unexpected recipe shape', 502)

  // Echo back the user's own ingredients (order + staple flags); trust the model only for
  // nutrition, steps, and tags.
  return {
    draft: {
      ...result.data,
      name: body.name || result.data.name,
      ingredients,
      link_url: '',
    },
  }
}
