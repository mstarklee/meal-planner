import { describe, it, expect } from 'vitest'
import { normalizeRecipeInput } from './recipeNormalize'

describe('normalizeRecipeInput', () => {
  it('drops blank ingredient rows (no item) and blank steps', () => {
    const out = normalizeRecipeInput({
      name: '  Dal  ',
      photo_url: '', link_url: '',
      meal_types: ['dinner'], tags: [],
      calories: null, protein: null, fiber: null, nutrition_estimated: false,
      ingredients: [{ amount: '1 cup', item: 'lentils' }, { amount: '', item: '' }, { amount: '2', item: '  ' }],
      steps: ['Boil', '', '   '],
      is_shared: false,
    })
    expect(out.ingredients).toEqual([{ amount: '1 cup', item: 'lentils' }])
    expect(out.steps).toEqual(['Boil'])
    expect(out.name).toBe('Dal')
  })
})
