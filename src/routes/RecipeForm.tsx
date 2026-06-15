import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MEAL_TYPES, RECIPE_TAGS, recipeSchema } from '../lib/recipe'
import type { MealType, Recipe, RecipeInput } from '../lib/recipe'
import { normalizeRecipeInput } from '../lib/recipeNormalize'
import { createRecipe, getRecipe, updateRecipe, uploadRecipePhoto } from '../lib/recipes'
import { useHousehold } from '../context/HouseholdProvider'
import TagPicker from '../components/TagPicker'
import DynamicList from '../components/DynamicList'

interface IngredientRow {
  id: string
  amount: string
  item: string
}

function numFromInput(v: string): number | null {
  return v === '' ? null : Number(v)
}

export default function RecipeForm() {
  const nav = useNavigate()
  const { id } = useParams()
  const { householdId } = useHousehold()

  const [loading, setLoading] = useState(Boolean(id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [mealTypes, setMealTypes] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [calories, setCalories] = useState<number | null>(null)
  const [protein, setProtein] = useState<number | null>(null)
  const [fiber, setFiber] = useState<number | null>(null)
  const [nutritionEstimated, setNutritionEstimated] = useState(false)
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [steps, setSteps] = useState<string[]>([])
  const [linkUrl, setLinkUrl] = useState('')
  const [isShared, setIsShared] = useState(false)

  useEffect(() => {
    if (!id) { return }
    let active = true
    void (async () => {
      try {
        const recipe = await getRecipe(id)
        if (!active) { return }
        if (!recipe) { setError('Recipe not found'); setLoading(false); return }
        setName(recipe.name)
        setPhotoUrl(recipe.photo_url)
        setMealTypes(recipe.meal_types)
        setTags(recipe.tags)
        setCalories(recipe.calories)
        setProtein(recipe.protein)
        setFiber(recipe.fiber)
        setNutritionEstimated(recipe.nutrition_estimated)
        setIngredients(recipe.ingredients.map((i) => ({ id: crypto.randomUUID(), amount: i.amount, item: i.item })))
        setSteps(recipe.steps)
        setLinkUrl(recipe.link_url)
        setIsShared(recipe.is_shared)
        setLoading(false)
      } catch (err) {
        if (!active) { return }
        setError(err instanceof Error ? err.message : 'Failed to load recipe')
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [id])

  function addIngredient() {
    setIngredients([...ingredients, { id: crypto.randomUUID(), amount: '', item: '' }])
  }
  function setIngredient(i: number, patch: Partial<Pick<IngredientRow, 'amount' | 'item'>>) {
    setIngredients(ingredients.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }
  function removeIngredient(i: number) {
    setIngredients(ingredients.filter((_, idx) => idx !== i))
  }

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { return }
    setError(null)
    try {
      setPhotoUrl(await uploadRecipePhoto(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const input: RecipeInput = {
      name,
      photo_url: photoUrl,
      link_url: linkUrl,
      meal_types: mealTypes as MealType[],
      tags,
      calories,
      protein,
      fiber,
      nutrition_estimated: nutritionEstimated,
      ingredients: ingredients.map((row) => ({ amount: row.amount, item: row.item })),
      steps,
      is_shared: isShared,
    }
    const normalized = normalizeRecipeInput(input)
    const result = recipeSchema.safeParse(normalized)
    if (!result.success) { setError(result.error.issues[0].message); return }

    setBusy(true)
    try {
      const saved: Recipe = id
        ? await updateRecipe(id, normalized)
        : await createRecipe(householdId as string, normalized)
      nav(`/recipes/${saved.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe')
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen px-6 py-8 max-w-md mx-auto">Loading…</div>
  }

  return (
    <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-brand mb-6">{id ? 'Edit recipe' : 'New recipe'}</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Photo</label>
          <div className="mt-1">
            {photoUrl && <img src={photoUrl} alt="Recipe" className="w-full rounded-xl mb-2 object-cover" />}
            <input type="file" accept="image/*" aria-label="Photo" onChange={onPhotoChange} />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
          <input className="w-full border rounded-xl p-3 mt-1" aria-label="Name" value={name}
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Veggie Bowl" />
        </div>

        <TagPicker label="Meal types" options={MEAL_TYPES} selected={mealTypes} onChange={setMealTypes} />
        <TagPicker label="Tags" options={RECIPE_TAGS} selected={tags} onChange={setTags} />

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Nutrition</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <label className="text-xs text-gray-500">Calories
              <input type="number" className="w-full border rounded-xl p-2 mt-1" aria-label="Calories"
                value={calories ?? ''} onChange={(e) => setCalories(numFromInput(e.target.value))} />
            </label>
            <label className="text-xs text-gray-500">Protein g
              <input type="number" className="w-full border rounded-xl p-2 mt-1" aria-label="Protein"
                value={protein ?? ''} onChange={(e) => setProtein(numFromInput(e.target.value))} />
            </label>
            <label className="text-xs text-gray-500">Fiber g
              <input type="number" className="w-full border rounded-xl p-2 mt-1" aria-label="Fiber"
                value={fiber ?? ''} onChange={(e) => setFiber(numFromInput(e.target.value))} />
            </label>
          </div>
          <label className="flex items-center gap-2 mt-2 text-sm text-gray-500">
            <input type="checkbox" checked={nutritionEstimated}
              onChange={(e) => setNutritionEstimated(e.target.checked)} />
            ≈ estimated
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Ingredients</label>
          <div className="space-y-2 mt-1">
            {ingredients.map((row, i) => (
              <div key={row.id} className="flex gap-2">
                <input className="w-24 border rounded-xl p-3" aria-label={`Ingredient ${i + 1} amount`}
                  value={row.amount} onChange={(e) => setIngredient(i, { amount: e.target.value })}
                  placeholder="1 cup" />
                <input className="flex-1 border rounded-xl p-3" aria-label={`Ingredient ${i + 1} item`}
                  value={row.item} onChange={(e) => setIngredient(i, { item: e.target.value })}
                  placeholder="rice" />
                <button type="button" aria-label={`Remove ingredient ${i + 1}`}
                  className="px-3 text-red-500" onClick={() => removeIngredient(i)}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addIngredient}
            className="mt-2 text-brand font-semibold text-sm">+ Add ingredient</button>
        </div>

        <DynamicList label="Steps" items={steps} onChange={setSteps}
          placeholder="Describe a step" addLabel="+ Add step" />

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Link</label>
          <input className="w-full border rounded-xl p-3 mt-1" aria-label="Link" value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-500">
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
          Share to friends' library
        </label>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={busy} className="w-full bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save recipe'}
        </button>
      </form>
    </div>
  )
}
