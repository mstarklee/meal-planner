import { supabase } from './supabase'

export interface Staple {
  id: string
  household_id: string
  name: string
  created_at: string
}

export async function getStaples(householdId: string): Promise<Staple[]> {
  const { data, error } = await supabase
    .from('household_staples')
    .select('*')
    .eq('household_id', householdId)
    .order('name')
  if (error) throw error
  return (data ?? []) as Staple[]
}

export async function addStaple(householdId: string, name: string): Promise<Staple> {
  const { data, error } = await supabase
    .from('household_staples')
    .insert({ household_id: householdId, name: name.trim() })
    .select()
    .single()
  if (error) throw error
  return data as Staple
}

export async function removeStaple(id: string): Promise<void> {
  const { error } = await supabase
    .from('household_staples')
    .delete()
    .eq('id', id)
  if (error) throw error
}
