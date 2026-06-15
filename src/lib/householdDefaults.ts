export interface HouseholdSettings {
  target_calories: number
  target_protein: number
  target_fiber: number
  evening_reminder_time: string
  morning_reminder_time: string
}

export function defaultTargets(): HouseholdSettings {
  return {
    target_calories: 2000,
    target_protein: 90,
    target_fiber: 30,
    evening_reminder_time: '20:00',
    morning_reminder_time: '07:00',
  }
}
