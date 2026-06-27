import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./openai', () => ({ callOpenAI: vi.fn() }))

import { handleDraftRecipe } from './draftHandler'
import { callOpenAI } from './openai'

const MODEL_OUT = {
  name: 'AI Name', meal_types: ['dinner'], tags: ['veg'],
  nutrients: { calories: 420, protein: 22 }, nutrition_estimated: true,
  ingredients: [{ amount: '999', item: 'model-invented' }], steps: ['Cook it'],
}

describe('handleDraftRecipe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fills AI nutrition/steps/tags but echoes the user ingredients and name', async () => {
    vi.mocked(callOpenAI).mockResolvedValue(MODEL_OUT)
    const { draft } = await handleDraftRecipe(
      { name: 'My Bowl', ingredients: [{ amount: '1 cup', item: 'rice', staple: true }, { amount: '', item: '' }] },
      'key',
    )
    // User's own name + ingredients win; the model's invented ingredient is dropped.
    expect(draft.name).toBe('My Bowl')
    expect(draft.ingredients).toEqual([{ amount: '1 cup', item: 'rice', staple: true }])
    // AI-derived fields are surfaced.
    expect(draft.nutrients.calories).toBe(420)
    expect(draft.nutrition_estimated).toBe(true)
    expect(draft.steps).toEqual(['Cook it'])
    expect(draft.meal_types).toEqual(['dinner'])
    expect(draft.link_url).toBe('')
  })

  it('rejects a body with no usable ingredients', async () => {
    await expect(handleDraftRecipe({ ingredients: [{ amount: '1', item: '  ' }] }, 'key')).rejects.toThrow()
    expect(callOpenAI).not.toHaveBeenCalled()
  })

  it('rejects an invalid body', async () => {
    await expect(handleDraftRecipe({ name: 'x' }, 'key')).rejects.toThrow()
  })
})
