import { describe, it, expect } from 'vitest'
import { recipeSchema } from './recipe'

const valid = {
  name: 'Chicken Quinoa Bowl',
  photo_url: '',
  link_url: '',
  meal_types: ['lunch', 'dinner'],
  tags: ['high-protein'],
  calories: 560, protein: 41, fiber: 11,
  nutrition_estimated: false,
  ingredients: [{ amount: '200g', item: 'chicken breast' }],
  steps: ['Grill chicken', 'Toss with quinoa'],
  is_shared: false,
}

describe('recipeSchema', () => {
  it('accepts a complete valid recipe', () => {
    expect(recipeSchema.safeParse(valid).success).toBe(true)
  })
  it('rejects an empty name', () => {
    expect(recipeSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })
  it('requires at least one meal type', () => {
    expect(recipeSchema.safeParse({ ...valid, meal_types: [] }).success).toBe(false)
  })
  it('allows null nutrition values', () => {
    expect(recipeSchema.safeParse({ ...valid, calories: null, protein: null, fiber: null }).success).toBe(true)
  })
  it('rejects an invalid link url', () => {
    expect(recipeSchema.safeParse({ ...valid, link_url: 'not-a-url' }).success).toBe(false)
  })
  it('rejects a blank ingredient item', () => {
    expect(recipeSchema.safeParse({ ...valid, ingredients: [{ amount: '1', item: '' }] }).success).toBe(false)
  })
})
