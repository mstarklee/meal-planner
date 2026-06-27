import { describe, it, expect } from 'vitest'
import { defaultSettings } from './householdDefaults'

describe('defaultSettings', () => {
  it('returns sensible reminder defaults', () => {
    expect(defaultSettings()).toEqual({
      evening_reminder_time: '20:00',
      morning_reminder_time: '07:00',
      timezone: 'UTC',
    })
  })
})
