import { supabase } from './supabase'
import type { Recipe, RecipeInput } from './recipe'

export async function listMyRecipes(householdId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes').select('*').eq('household_id', householdId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function listSharedRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes').select('*').eq('is_shared', true).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase.from('recipes').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Recipe) ?? null
}

export async function createRecipe(householdId: string, input: RecipeInput): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes').insert({ ...input, household_id: householdId }).select('*').single()
  if (error) throw error
  return data as Recipe
}

export async function updateRecipe(id: string, input: RecipeInput): Promise<Recipe> {
  const { data, error } = await supabase.from('recipes').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
}

export async function uploadRecipePhoto(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('recipe-photos').upload(path, file)
  if (error) throw error
  return supabase.storage.from('recipe-photos').getPublicUrl(path).data.publicUrl
}
