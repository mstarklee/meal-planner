import { useEffect, useState, useCallback } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import { weekStartDate, tomorrowDate } from '../lib/mealPlan'
import type { PoolEntry, DailyPick } from '../lib/mealPlan'
import { getFullPool, getPicksForDate } from '../lib/mealPlans'
import type { PantryItem, ShoppingRow } from '../lib/pantry'
import { buildShoppingRows } from '../lib/pantry'
import { getPantryItems, getShoppingChecks, toggleShoppingCheck } from '../lib/pantryData'
import { getStaples } from '../lib/staples'
import ShoppingList from '../components/ShoppingList'

type ShopMode = 'week' | 'tomorrow'

export default function Shop() {
  const { householdId } = useHousehold()
  const [mode, setMode] = useState<ShopMode>('week')
  const [rows, setRows] = useState<ShoppingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const week = weekStartDate()
  const tomorrow = tomorrowDate()

  const load = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    setError(null)
    try {
      const [pantryItems, checks, staples, recipes] = await Promise.all([
        getPantryItems(householdId),
        getShoppingChecks(householdId, week),
        getStaples(householdId),
        mode === 'week'
          ? getFullPool(householdId, week).then((entries: PoolEntry[]) =>
              entries.map((e) => e.recipe))
          : getPicksForDate(householdId, tomorrow).then((picks: DailyPick[]) =>
              picks.map((p) => p.recipe)),
      ])
      const checkSet = new Set(checks.map((c) => c.item))
      const uniqueRecipes = dedupeRecipes(recipes)
      setRows(buildShoppingRows(uniqueRecipes, pantryItems as PantryItem[], checkSet, staples.map((s) => s.name)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [householdId, mode, week, tomorrow])

  useEffect(() => { void load() }, [load])

  async function handleToggle(itemKey: string, currentlyChecked: boolean) {
    if (!householdId) return
    try {
      await toggleShoppingCheck(householdId, itemKey, week, currentlyChecked)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  const toBuyCount = rows.filter((r) => !r.checked && !r.inPantry).length
  const totalCount = rows.filter((r) => !r.inPantry).length

  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand">Shop</h1>
        {totalCount > 0 && (
          <p className="text-sm text-gray-500">
            <span className="font-bold text-gray-700">{toBuyCount}</span> of {totalCount} remaining
          </p>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['week', 'This Week'],
          ['tomorrow', 'Just Tomorrow'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button"
            onClick={() => setMode(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              mode === value ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <p className="text-gray-500 text-center">Loading...</p>
        ) : (
          <ShoppingList rows={rows} onToggle={handleToggle} />
        )}
      </div>
    </div>
  )
}

function dedupeRecipes(recipes: { id: string; name: string; ingredients: { amount: string; item: string }[] }[]) {
  const seen = new Set<string>()
  return recipes.filter((r) => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
}
