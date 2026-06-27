import { describe, it, expect } from 'vitest'
import { ruleBasedLevel, coerceLevel } from './suggestActivity'

describe('ruleBasedLevel', () => {
  it('lose_fat → fat_loss', () => { expect(ruleBasedLevel({ trainsPerWeek: 0, goal: 'lose_fat' })).toBe('fat_loss') })
  it('build_muscle → strength', () => { expect(ruleBasedLevel({ trainsPerWeek: 1, goal: 'build_muscle' })).toBe('strength') })
  it('frequent training → strength', () => { expect(ruleBasedLevel({ trainsPerWeek: 4, goal: 'maintain' })).toBe('strength') })
  it('some training → moderate', () => { expect(ruleBasedLevel({ trainsPerWeek: 1, goal: 'maintain' })).toBe('moderate') })
  it('none → sedentary', () => { expect(ruleBasedLevel({ trainsPerWeek: 0, goal: 'maintain' })).toBe('sedentary') })
})

describe('coerceLevel', () => {
  it('keeps a valid level', () => { expect(coerceLevel('strength', 'sedentary')).toBe('strength') })
  it('falls back on garbage', () => { expect(coerceLevel('nope', 'moderate')).toBe('moderate') })
})
