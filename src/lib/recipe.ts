import { z } from 'zod'

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'kid'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export const RECIPE_TAGS = ['healthy', 'high-protein', 'kid-friendly', 'cheat', 'veg', 'fiber-rich'] as const

const optionalUrl = z.union([z.literal(''), z.string().url('Enter a valid URL')])

export const recipeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  photo_url: optionalUrl,
  link_url: optionalUrl,
  meal_types: z.array(z.enum(MEAL_TYPES)).min(1, 'Pick at least one meal type'),
  tags: z.array(z.string()),
  calories: z.number().int().nonnegative().nullable(),
  protein: z.number().int().nonnegative().nullable(),
  fiber: z.number().int().nonnegative().nullable(),
  nutrition_estimated: z.boolean(),
  ingredients: z.array(z.object({ amount: z.string(), item: z.string().trim().min(1, 'Ingredient required') })),
  steps: z.array(z.string().trim().min(1, 'Step cannot be empty')),
  is_shared: z.boolean(),
})

export type RecipeInput = z.infer<typeof recipeSchema>

export interface Recipe extends RecipeInput {
  id: string
  household_id: string
  created_by: string
  created_at: string
}
