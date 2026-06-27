import { describe, it, expect } from 'vitest'
import { sumNutrients, buildNutrientRows } from './nutrition'

describe('sumNutrients', () => {
  it('adds per-person values and treats null/missing as 0', () => {
    const total = sumNutrients([{ calories: 400, protein: 20 }, { calories: 300, protein: null }])
    expect(total.calories).toBe(700)
    expect(total.protein).toBe(20)
  })
})

describe('buildNutrientRows', () => {
  it('computes pct against the chosen target map', () => {
    const rows = buildNutrientRows({ calories: 1000 }, { calories: 2000 })
    const cal = rows.find((r) => r.def.key === 'calories')!
    expect(cal.target).toBe(2000)
    expect(cal.pct).toBeCloseTo(0.5)
  })
  it('target of 0 produces pct of 0', () => {
    const rows = buildNutrientRows({ calories: 1400 }, { calories: 1400 })
    expect(rows.find((r) => r.def.key === 'calories')!.target).toBe(1400)
  })
})
