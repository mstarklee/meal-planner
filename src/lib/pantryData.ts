import { supabase } from './supabase'
import type { PantryItem, PantryStatus, ShoppingCheck } from './pantry'

export async function getPantryItems(householdId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('household_id', householdId)
    .order('name')
  if (error) throw error
  return (data ?? []) as PantryItem[]
}

export async function addPantryItem(householdId: string, name: string): Promise<PantryItem> {
  const { data, error } = await supabase
    .from('pantry_items')
    .insert({ household_id: householdId, name: name.trim(), status: 'good' })
    .select()
    .single()
  if (error) throw error
  return data as PantryItem
}

export async function updatePantryStatus(id: string, status: PantryStatus): Promise<void> {
  const { error } = await supabase
    .from('pantry_items')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

export async function bulkUpdatePantryStatus(ids: string[], status: PantryStatus): Promise<void> {
  const { error } = await supabase
    .from('pantry_items')
    .update({ status })
    .in('id', ids)
  if (error) throw error
}

export async function deletePantryItems(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('pantry_items')
    .delete()
    .in('id', ids)
  if (error) throw error
}

export async function getShoppingChecks(householdId: string, weekStart: string): Promise<ShoppingCheck[]> {
  const { data, error } = await supabase
    .from('shopping_checks')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
  if (error) throw error
  return (data ?? []) as ShoppingCheck[]
}

export async function toggleShoppingCheck(householdId: string, item: string, weekStart: string, isChecked: boolean): Promise<void> {
  if (isChecked) {
    const { error } = await supabase
      .from('shopping_checks')
      .delete()
      .eq('household_id', householdId)
      .eq('item', item)
      .eq('week_start', weekStart)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('shopping_checks')
      .insert({ household_id: householdId, item, week_start: weekStart })
    if (error) throw error
  }
}
