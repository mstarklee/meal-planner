import { z } from 'zod'
import { MEAL_TYPES, RECIPE_TAGS } from './recipe'
import type { RecipeInput } from './recipe'

// What the import backend returns. The model is constrained by the server's strict
// json_schema; this schema re-validates defensively and the client maps it to a RecipeInput.
export const recipeDraftSchema = z.object({
  name: z.string().default(''),
  meal_types: z.array(z.enum(MEAL_TYPES)).default([]),
  tags: z.array(z.enum(RECIPE_TAGS)).default([]),
  calories: z.number().int().nonnegative().nullable().default(null),
  protein: z.number().int().nonnegative().nullable().default(null),
  fiber: z.number().int().nonnegative().nullable().default(null),
  nutrition_estimated: z.boolean().default(false),
  ingredients: z.array(z.object({ amount: z.string().default(''), item: z.string() })).default([]),
  steps: z.array(z.string()).default([]),
  link_url: z.string().default(''),
})

export type RecipeDraft = z.infer<typeof recipeDraftSchema>

export function draftToRecipeInput(draft: RecipeDraft): RecipeInput {
  return {
    name: draft.name,
    photo_url: '',
    link_url: draft.link_url,
    meal_types: draft.meal_types,
    tags: draft.tags,
    calories: draft.calories,
    protein: draft.protein,
    fiber: draft.fiber,
    nutrition_estimated: draft.nutrition_estimated,
    ingredients: draft.ingredients.map((i) => ({ amount: i.amount, item: i.item })),
    steps: draft.steps,
    is_shared: false,
  }
}
