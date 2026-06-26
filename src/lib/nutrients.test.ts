import { describe, it, expect } from 'vitest'
import { NUTRIENTS, NUTRIENT_KEYS, seedTargets, emptyNutrientMap } from './nutrients'

describe('nutrient registry', () => {
  it('has 17 nutrients with complete, unique definitions', () => {
    expect(NUTRIENTS).toHaveLength(17)
    expect(new Set(NUTRIENT_KEYS).size).toBe(17)
    for (const n of NUTRIENTS) {
      expect(n.key && n.label && n.unit && n.group && n.icon && n.why).toBeTruthy()
      expect(n.adultRda).toBeGreaterThan(0)
      expect(n.kidRda).toBeGreaterThan(0)
    }
  })

  it('seedTargets returns a value for every nutrient', () => {
    expect(Object.keys(seedTargets('adult'))).toHaveLength(17)
    expect(Object.keys(seedTargets('kid'))).toHaveLength(17)
  })

  it('emptyNutrientMap is all nulls', () => {
    const m = emptyNutrientMap()
    expect(Object.values(m).every((v) => v === null)).toBe(true)
  })
})
