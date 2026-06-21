import { describe, it, expect } from 'vitest'
import { isStapleItem, buildShoppingRows } from './pantry'
import type { PantryItem } from './pantry'

const noPantry: PantryItem[] = []
const noChecks = new Set<string>()

describe('isStapleItem', () => {
  it('matches case-insensitively and bidirectionally', () => {
    expect(isStapleItem('Salt', ['salt'])).toBe(true)
    expect(isStapleItem('table salt', ['salt'])).toBe(true)
    expect(isStapleItem('paneer', ['salt', 'sugar'])).toBe(false)
  })
  it('returns false for empty inputs', () => {
    expect(isStapleItem('', ['salt'])).toBe(false)
    expect(isStapleItem('salt', [])).toBe(false)
  })
})

describe('buildShoppingRows staple filtering', () => {
  const recipe = (ingredients: { amount: string; item: string; staple?: boolean }[]) =>
    [{ id: 'r1', name: 'Dish', ingredients }]

  it('hides ingredients explicitly flagged staple', () => {
    const rows = buildShoppingRows(
      recipe([{ amount: '200g', item: 'paneer', staple: false }, { amount: '1 tsp', item: 'salt', staple: true }]),
      noPantry, noChecks, ['salt'],
    )
    expect(rows.map((r) => r.item)).toEqual(['paneer'])
  })

  it('hides legacy ingredients (no flag) that match the staples list', () => {
    const rows = buildShoppingRows(
      recipe([{ amount: '200g', item: 'paneer' }, { amount: '1 tsp', item: 'cumin' }]),
      noPantry, noChecks, ['cumin'],
    )
    expect(rows.map((r) => r.item)).toEqual(['paneer'])
  })

  it('keeps a main ingredient even if it appears in the staples list when explicitly flagged main', () => {
    const rows = buildShoppingRows(
      recipe([{ amount: '2', item: 'egg', staple: false }]),
      noPantry, noChecks, ['egg'],
    )
    expect(rows.map((r) => r.item)).toEqual(['egg'])
  })

  it('still applies pantry "good" matching to main ingredients', () => {
    const pantry: PantryItem[] = [
      { id: 'p1', household_id: 'h', name: 'paneer', status: 'good', created_at: '' },
    ]
    const rows = buildShoppingRows(
      recipe([{ amount: '200g', item: 'paneer', staple: false }]),
      pantry, noChecks, [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].inPantry).toBe(true)
  })
})
