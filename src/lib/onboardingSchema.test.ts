import { describe, it, expect } from 'vitest'
import { onboardingSchema } from './onboardingSchema'

const base = {
  householdName: 'Star Family',
  displayName: 'Mouni',
  members: [{ name: 'Mouni', sex: 'female', age: 35, weight_kg: 60, activity_level: 'moderate' }],
  evening_reminder_time: '20:00',
  morning_reminder_time: '07:00',
}

describe('onboardingSchema', () => {
  it('accepts a valid household with one member', () => {
    expect(onboardingSchema.safeParse(base).success).toBe(true)
  })
  it('requires at least one member', () => {
    const r = onboardingSchema.safeParse({ ...base, members: [] })
    expect(r.success).toBe(false)
  })
  it('rejects an invalid activity level', () => {
    const r = onboardingSchema.safeParse({
      ...base,
      members: [{ ...base.members[0], activity_level: 'bogus' }],
    })
    expect(r.success).toBe(false)
  })
  it('rejects non-positive weight', () => {
    const r = onboardingSchema.safeParse({
      ...base,
      members: [{ ...base.members[0], weight_kg: 0 }],
    })
    expect(r.success).toBe(false)
  })
})
