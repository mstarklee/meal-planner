import type { RecipeInput } from './recipe'

export function normalizeRecipeInput(input: RecipeInput): RecipeInput {
  return {
    ...input,
    name: input.name.trim(),
    ingredients: input.ingredients
      .map((i) => ({ amount: i.amount.trim(), item: i.item.trim() }))
      .filter((i) => i.item.length > 0),
    steps: input.steps.map((s) => s.trim()).filter((s) => s.length > 0),
  }
}
