import { describe, it, expect } from 'vitest'
import { defaultTargets } from './householdDefaults'
import { seedTargets } from './nutrients'

describe('defaultTargets', () => {
  it('returns sensible family defaults', () => {
    expect(defaultTargets()).toEqual({
      adults: 2,
      targets_adult: seedTargets('adult'),
      targets_kid: seedTargets('kid'),
      evening_reminder_time: '20:00',
      morning_reminder_time: '07:00',
      timezone: 'UTC',
    })
  })

  it('seeds adult and kid targets from the nutrient registry', () => {
    const d = defaultTargets()
    expect(d.targets_adult.calories).toBe(2000)
    expect(d.targets_kid.calories).toBe(1400)
  })
})
