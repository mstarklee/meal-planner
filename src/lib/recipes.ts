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
  const { data, error } = await supabase.from('recipes').update(input).eq('id', id).select('*').maybeSingle()
  if (error) throw error
  // RLS lets the update return 0 rows when the caller is not the creator (e.g. a shared
  // recipe opened via /recipes/:id/edit). Surface a clear message instead of a null cast.
  if (!data) throw new Error('You can only edit recipes you created.')
  return data as Recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
}

export async function uploadRecipePhoto(file: File): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user.id
  if (!uid) throw new Error('Not signed in')
  const ext = file.name.split('.').pop() ?? 'jpg'
  // Upload into a per-user folder so the storage RLS policy can scope writes to the caller.
  const path = `${uid}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('recipe-photos').upload(path, file)
  if (error) throw error
  return supabase.storage.from('recipe-photos').getPublicUrl(path).data.publicUrl
}
