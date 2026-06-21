import { supabase } from './supabase'
import type { Recipe } from './recipe'
import type { PoolSlot, PickSlot, PoolEntry, DailyPick } from './mealPlan'
import type { HouseholdSettings } from './householdDefaults'

export async function getPool(householdId: string, slot: PoolSlot, weekStart: string): Promise<PoolEntry[]> {
  const { data, error } = await supabase
    .from('week_pool')
    .select('*, recipe:recipes(*)')
    .eq('household_id', householdId)
    .eq('slot', slot)
    .eq('week_start', weekStart)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as PoolEntry[]
}

export async function getFullPool(householdId: string, weekStart: string): Promise<PoolEntry[]> {
  const { data, error } = await supabase
    .from('week_pool')
    .select('*, recipe:recipes(*)')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as PoolEntry[]
}

export async function addToPool(householdId: string, recipeId: string, slot: PoolSlot, weekStart: string): Promise<void> {
  const { error } = await supabase
    .from('week_pool')
    .insert({ household_id: householdId, recipe_id: recipeId, slot, week_start: weekStart })
  if (error) throw error
}

export async function removeFromPool(entryId: string): Promise<void> {
  const { error } = await supabase.from('week_pool').delete().eq('id', entryId)
  if (error) throw error
}

export async function listRecipesForSlot(slot: PoolSlot): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .contains('meal_types', [slot])
    .order('name')
  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function getPicksForDate(householdId: string, date: string): Promise<DailyPick[]> {
  const { data, error } = await supabase
    .from('daily_picks')
    .select('*, recipe:recipes(*)')
    .eq('household_id', householdId)
    .eq('pick_date', date)
  if (error) throw error
  return (data ?? []) as DailyPick[]
}

export async function setPick(
  householdId: string,
  recipeId: string,
  slot: PickSlot,
  date: string,
): Promise<void> {
  const { error: delErr } = await supabase
    .from('daily_picks')
    .delete()
    .eq('household_id', householdId)
    .eq('slot', slot)
    .eq('pick_date', date)
  if (delErr) throw delErr
  const { error } = await supabase
    .from('daily_picks')
    .insert({ household_id: householdId, recipe_id: recipeId, slot, pick_date: date })
  if (error) throw error
}

export async function clearPick(
  householdId: string,
  slot: PickSlot,
  date: string,
): Promise<void> {
  const { error } = await supabase
    .from('daily_picks')
    .delete()
    .eq('household_id', householdId)
    .eq('slot', slot)
    .eq('pick_date', date)
  if (error) throw error
}

export async function getHouseholdSettings(householdId: string): Promise<HouseholdSettings> {
  const { data, error } = await supabase
    .from('household_settings')
    .select('target_calories, target_protein, target_fiber, evening_reminder_time, morning_reminder_time')
    .eq('household_id', householdId)
    .single()
  if (error) throw error
  return data as HouseholdSettings
}
