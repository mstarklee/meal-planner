import { describe, it, expect } from 'vitest'
import { defaultTargets } from './householdDefaults'

describe('defaultTargets', () => {
  it('returns sensible family defaults', () => {
    expect(defaultTargets()).toEqual({
      target_calories: 2000,
      target_protein: 90,
      target_fiber: 30,
      evening_reminder_time: '20:00',
      morning_reminder_time: '07:00',
    })
  })
})
