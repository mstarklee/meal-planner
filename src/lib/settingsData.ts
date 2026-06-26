import { supabase } from './supabase'

export interface ReminderSettingsInput {
  evening_reminder_time: string
  morning_reminder_time: string
  timezone: string
}

export async function updateReminderSettings(householdId: string, input: ReminderSettingsInput): Promise<void> {
  const { error } = await supabase
    .from('household_settings')
    .update(input)
    .eq('household_id', householdId)
  if (error) throw error
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export interface NutritionSettingsInput {
  adults: number
  targets_adult: Record<string, number>
  targets_kid: Record<string, number>
}

export async function updateNutritionSettings(householdId: string, input: NutritionSettingsInput): Promise<void> {
  const { error } = await supabase
    .from('household_settings')
    .update(input)
    .eq('household_id', householdId)
  if (error) throw error
}
