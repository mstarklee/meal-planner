export interface HouseholdSettings {
  evening_reminder_time: string
  morning_reminder_time: string
  timezone: string
}

export function defaultSettings(): HouseholdSettings {
  return {
    evening_reminder_time: '20:00',
    morning_reminder_time: '07:00',
    timezone: 'UTC',
  }
}
