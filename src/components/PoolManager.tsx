import { useEffect, useState } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import { POOL_SLOTS, POOL_SLOT_LABELS, weekStartDate } from '../lib/mealPlan'
import type { PoolSlot, PoolEntry } from '../lib/mealPlan'
import type { Recipe } from '../lib/recipe'
import { getPool, addToPool, removeFromPool, listRecipesForSlot } from '../lib/mealPlans'

const POOL_TARGET = 7

export default function PoolManager() {
  const { householdId, kids } = useHousehold()
  const [slot, setSlot] = useState<PoolSlot>('breakfast')
  const [pool, setPool] = useState<PoolEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const week = weekStartDate()
  const slots = kids.length > 0 ? POOL_SLOTS : POOL_SLOTS.filter((s) => s !== 'kid')

  useEffect(() => {
    if (!householdId) return
    let active = true
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [poolData, recipeData] = await Promise.all([
          getPool(householdId, slot, week),
          listRecipesForSlot(slot),
        ])
        if (!active) return
        setPool(poolData)
        setRecipes(recipeData)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [householdId, slot, week])

  const poolRecipeIds = new Set(pool.map((e) => e.recipe_id))

  async function toggle(recipe: Recipe) {
    if (!householdId) return
    const existing = pool.find((e) => e.recipe_id === recipe.id)
    try {
      if (existing) {
        await removeFromPool(existing.id)
        setPool(pool.filter((e) => e.id !== existing.id))
      } else {
        await addToPool(householdId, recipe.id, slot, week)
        const updated = await getPool(householdId, slot, week)
        setPool(updated)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update pool')
    }
  }

  return (
    <div className="space-y-4">
      {/* Slot tabs */}
      <div className="flex bg-brand-soft rounded-xl p-1">
        {slots.map((s) => (
          <button key={s} type="button" onClick={() => setSlot(s)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              slot === s ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {POOL_SLOT_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Counter */}
      <p className="text-sm text-gray-500 text-center">
        <span className={`font-bold ${pool.length >= POOL_TARGET ? 'text-brand' : 'text-gray-700'}`}>
          {pool.length}
        </span>
        {' '}of {POOL_TARGET} added
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-center">Loading...</p>
      ) : recipes.length === 0 ? (
        <p className="text-gray-500 text-center text-sm">
          No recipes match this slot. Add some in the Recipes tab.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {recipes.map((recipe) => {
            const inPool = poolRecipeIds.has(recipe.id)
            return (
              <button key={recipe.id} type="button" onClick={() => toggle(recipe)}
                className={`rounded-xl border-2 overflow-hidden text-left transition-colors ${
                  inPool ? 'border-brand bg-brand-soft' : 'border-gray-200 bg-white'
                }`}>
                {recipe.photo_url ? (
                  <img src={recipe.photo_url} alt="" className="w-full aspect-[4/3] object-cover" />
                ) : (
                  <div className="w-full aspect-[4/3] bg-brand-soft flex items-center justify-center text-3xl">
                    🍽️
                  </div>
                )}
                <div className="p-2 flex items-start gap-1">
                  <span className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${
                    inPool ? 'border-brand bg-brand text-white' : 'border-gray-300'
                  }`}>
                    {inPool ? '✓' : ''}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 leading-tight">{recipe.name}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
