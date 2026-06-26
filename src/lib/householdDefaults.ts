import { seedTargets } from './nutrients'

export interface HouseholdSettings {
  adults: number
  targets_adult: Record<string, number>
  targets_kid: Record<string, number>
  evening_reminder_time: string
  morning_reminder_time: string
  timezone: string
}

export function defaultTargets(): HouseholdSettings {
  return {
    adults: 2,
    targets_adult: seedTargets('adult'),
    targets_kid: seedTargets('kid'),
    evening_reminder_time: '20:00',
    morning_reminder_time: '07:00',
    timezone: 'UTC',
  }
}
