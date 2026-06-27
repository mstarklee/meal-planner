import { describe, it, expect } from 'vitest'
import {
  computeTargets, effectiveTargets, isKid, familyTargets, kidTargets,
  type Member, type MemberProfile,
} from './nutritionTargets'

const adult = (over: Partial<MemberProfile> = {}): MemberProfile => ({
  id: 'a', name: 'Mum', sex: 'female', age: 35, weightKg: 60, activity: 'sedentary', ...over,
})
const member = (p: MemberProfile, overrides = {}): Member => ({ ...p, overrides })

describe('computeTargets — adults', () => {
  it('protein = weight × g/kg from the activity table (sedentary 0.8)', () => {
    expect(computeTargets(adult()).protein).toBe(48) // 60 × 0.8
  })
  it('strength training uses 1.8 g/kg', () => {
    expect(computeTargets(adult({ activity: 'strength', weightKg: 70 })).protein).toBe(126) // 70 × 1.8
  })
  it('fat_loss uses 2.0 g/kg but maintenance calories (not below moderate-equivalent)', () => {
    const t = computeTargets(adult({ activity: 'fat_loss', weightKg: 70 }))
    expect(t.protein).toBe(140) // 70 × 2.0
    expect(t.calories).toBe(Math.round(70 * 22 * 1.45)) // maintenance factor, no deficit
  })
  it('calories = weight × 22 × activity factor', () => {
    expect(computeTargets(adult({ weightKg: 70, activity: 'moderate' })).calories).toBe(Math.round(70 * 22 * 1.375))
  })
  it('derives carbs/fats/fiber from calories', () => {
    const t = computeTargets(adult({ weightKg: 70, activity: 'moderate' }))
    const cal = t.calories as number
    expect(t.carbs).toBe(Math.round((cal * 0.5) / 4))
    expect(t.healthy_fats).toBe(Math.round((cal * 0.3) / 9))
    expect(t.fiber).toBe(Math.round((cal / 1000) * 14))
  })
  it('pulls micros from the adult female 19-50 band (iron 18, calcium 1000)', () => {
    const t = computeTargets(adult())
    expect(t.iron).toBe(18)
    expect(t.calcium).toBe(1000)
  })
  it('adult male 19-50 band differs (iron 8)', () => {
    expect(computeTargets(adult({ sex: 'male' })).iron).toBe(8)
  })
  it('returns all 17 nutrient keys', () => {
    const t = computeTargets(adult())
    const keys = ['calories','protein','carbs','healthy_fats','fiber','vitamin_a','vitamin_c','vitamin_d','folate','choline','vitamin_b12','iron','calcium','potassium','zinc','magnesium','omega_3']
    for (const k of keys) expect(typeof t[k]).toBe('number')
  })
})

describe('computeTargets — kids', () => {
  const kid = (over: Partial<MemberProfile> = {}): MemberProfile =>
    ({ id: 'k', name: 'Aria', sex: 'female', age: 8, weightKg: 25, activity: 'sedentary', ...over })
  it('kid protein uses pediatric g/kg (4-13 → 0.95), ignores activity', () => {
    expect(computeTargets(kid({ activity: 'strength' })).protein).toBe(Math.round(25 * 0.95)) // 24
  })
  it('kid calories come from the age/sex band, not weight', () => {
    expect(computeTargets(kid()).calories).toBe(1300) // 4-8 female
  })
  it('kid micros use the 4-8 band (calcium 1000)', () => {
    expect(computeTargets(kid()).calcium).toBe(1000)
  })
})

describe('isKid', () => {
  it('under 18 is a kid', () => { expect(isKid({ ...adult({ age: 17 }) })).toBe(true) })
  it('18+ is an adult', () => { expect(isKid({ ...adult({ age: 18 }) })).toBe(false) })
})

describe('effectiveTargets', () => {
  it('applies overrides on top of computed values', () => {
    const m = member(adult(), { protein: 100 })
    expect(effectiveTargets(m).protein).toBe(100)
    expect(effectiveTargets(m).calories).toBe(computeTargets(adult()).calories)
  })
  it('ignores non-numeric override entries', () => {
    const m = member(adult(), { protein: null })
    expect(effectiveTargets(m).protein).toBe(48)
  })
})

describe('rollups', () => {
  const mum = member(adult({ id: 'm', weightKg: 60 }))
  const dad = member(adult({ id: 'd', sex: 'male', weightKg: 80, activity: 'strength' }))
  const kid = member(adult({ id: 'k', age: 8, sex: 'male', weightKg: 25 }))
  it('familyTargets sums every member', () => {
    const f = familyTargets([mum, dad, kid])
    expect(f.protein).toBe(
      (effectiveTargets(mum).protein as number) +
      (effectiveTargets(dad).protein as number) +
      (effectiveTargets(kid).protein as number),
    )
  })
  it('kidTargets sums only under-18s', () => {
    expect(kidTargets([mum, dad, kid]).protein).toBe(effectiveTargets(kid).protein)
  })
})
