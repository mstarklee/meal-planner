import { describe, it, expect } from 'vitest'
import { sumNutrients, buildNutrientRows } from './nutrition'
import { seedTargets } from './nutrients'

describe('sumNutrients', () => {
  it('adds per-person values and treats null/missing as 0', () => {
    const total = sumNutrients([{ calories: 400, protein: 20 }, { calories: 300, protein: null }])
    expect(total.calories).toBe(700)
    expect(total.protein).toBe(20)
  })
})

describe('buildNutrientRows', () => {
  it('computes pct against the chosen target map', () => {
    const rows = buildNutrientRows({ calories: 1000 }, seedTargets('adult'))
    const cal = rows.find((r) => r.def.key === 'calories')!
    expect(cal.target).toBe(2000)
    expect(cal.pct).toBeCloseTo(0.5)
  })
  it('kid targets differ from adult', () => {
    const rows = buildNutrientRows({ calories: 1400 }, seedTargets('kid'))
    expect(rows.find((r) => r.def.key === 'calories')!.target).toBe(1400)
  })
})
