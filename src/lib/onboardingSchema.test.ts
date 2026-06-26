import { describe, it, expect } from 'vitest'
import { onboardingSchema } from './onboardingSchema'

describe('onboardingSchema', () => {
  it('accepts a household with zero kids', () => {
    const r = onboardingSchema.safeParse({
      householdName: 'Star Family',
      displayName: 'Mouni',
      kids: [],
      adults: 2,
      evening_reminder_time: '20:00', morning_reminder_time: '07:00',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a dynamic list of named kids', () => {
    const r = onboardingSchema.safeParse({
      householdName: 'Star Family', displayName: 'Mouni',
      kids: [{ name: 'Aanya' }, { name: 'Vihaan' }],
      adults: 2,
      evening_reminder_time: '20:00', morning_reminder_time: '07:00',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an empty household name', () => {
    const r = onboardingSchema.safeParse({
      householdName: '', displayName: 'Mouni', kids: [],
      adults: 2,
      evening_reminder_time: '20:00', morning_reminder_time: '07:00',
    })
    expect(r.success).toBe(false)
  })

  it('rejects a kid with a blank name', () => {
    const r = onboardingSchema.safeParse({
      householdName: 'Star Family', displayName: 'Mouni',
      kids: [{ name: '' }],
      adults: 2,
      evening_reminder_time: '20:00', morning_reminder_time: '07:00',
    })
    expect(r.success).toBe(false)
  })
})
