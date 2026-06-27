import { supabase } from './supabase'
import type { Member, Sex, ActivityLevel } from './nutritionTargets'
import type { NutrientMap } from './nutrients'

// DB row shape (snake_case) for household_members.
export interface MemberRow {
  id: string
  household_id: string
  name: string | null
  sex: Sex
  age: number
  weight_kg: number
  activity_level: ActivityLevel
  overrides: NutrientMap
}

// Fields a form supplies when creating/updating a member.
export interface MemberInput {
  name: string | null
  sex: Sex
  age: number
  weight_kg: number
  activity_level: ActivityLevel
  overrides?: NutrientMap
}

// Map a DB row to the camelCase Member the engine consumes.
export function rowToMember(r: MemberRow): Member {
  return {
    id: r.id,
    name: r.name,
    sex: r.sex,
    age: r.age,
    weightKg: Number(r.weight_kg),
    activity: r.activity_level,
    overrides: r.overrides ?? {},
  }
}

export async function getMembers(householdId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as MemberRow[]).map(rowToMember)
}

export async function addMember(householdId: string, input: MemberInput): Promise<Member> {
  const { data, error } = await supabase
    .from('household_members')
    .insert({ household_id: householdId, overrides: {}, ...input })
    .select('*')
    .single()
  if (error) throw error
  return rowToMember(data as MemberRow)
}

export async function updateMember(id: string, input: Partial<MemberInput>): Promise<void> {
  const { error } = await supabase.from('household_members').update(input).eq('id', id)
  if (error) throw error
}

export async function removeMember(id: string): Promise<void> {
  const { error } = await supabase.from('household_members').delete().eq('id', id)
  if (error) throw error
}
