import { describe, it, expect } from 'vitest'
import { recipeDraftSchema, draftToRecipeInput } from './recipeDraft'

describe('recipeDraftSchema', () => {
  it('fills defaults for a sparse payload', () => {
    const out = recipeDraftSchema.parse({ name: 'Soup' })
    expect(out.meal_types).toEqual([])
    expect(out.calories).toBeNull()
    expect(out.nutrition_estimated).toBe(false)
    expect(out.ingredients).toEqual([])
  })
  it('rejects an unknown meal type', () => {
    expect(recipeDraftSchema.safeParse({ name: 'X', meal_types: ['brunch'] }).success).toBe(false)
  })
})

describe('draftToRecipeInput', () => {
  it('maps a draft into a saveable RecipeInput with private defaults', () => {
    const input = draftToRecipeInput(recipeDraftSchema.parse({
      name: 'Dal', meal_types: ['dinner'], tags: ['veg'],
      calories: 300, protein: 18, fiber: 9, nutrition_estimated: true,
      ingredients: [{ amount: '1 cup', item: 'lentils' }], steps: ['Boil'], link_url: 'https://x.test',
    }))
    expect(input.photo_url).toBe('')
    expect(input.is_shared).toBe(false)
    expect(input.link_url).toBe('https://x.test')
    expect(input.ingredients).toEqual([{ amount: '1 cup', item: 'lentils' }])
    expect(input.nutrition_estimated).toBe(true)
  })
})
