import { useEffect, useState, useCallback } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import { weekStartDate, tomorrowDate } from '../lib/mealPlan'
import type { PoolEntry, DailyPick } from '../lib/mealPlan'
import { getFullPool, getPicksForDate } from '../lib/mealPlans'
import type { PantryItem, ShoppingRow } from '../lib/pantry'
import { buildShoppingRows } from '../lib/pantry'
import { getPantryItems, getShoppingChecks, toggleShoppingCheck } from '../lib/pantryData'
import { getStaples } from '../lib/staples'
import { countForSlot } from '../lib/scale'
import ShoppingList from '../components/ShoppingList'
import ScreenHeader from '../components/ScreenHeader'
import TopBar from '../components/TopBar'
import SegmentedTabs from '../components/SegmentedTabs'

type ShopMode = 'week' | 'tomorrow'

export default function Shop() {
  const { householdId, familyCount, kidCount } = useHousehold()
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
              entries.map((e) => ({ recipe: e.recipe, scale: countForSlot(e.slot, familyCount, kidCount) })))
          : getPicksForDate(householdId, tomorrow).then((picks: DailyPick[]) =>
              picks.map((p) => ({ recipe: p.recipe, scale: countForSlot(p.slot, familyCount, kidCount) }))),
      ])
      const checkSet = new Set(checks.map((c) => c.item))
      const occurrences = dedupeOccurrences(recipes)
      setRows(buildShoppingRows(
        occurrences.map((o) => ({ id: o.recipe.id, name: o.recipe.name, scale: o.scale, ingredients: o.recipe.ingredients })),
        pantryItems as PantryItem[], checkSet, staples.map((s) => s.name)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [householdId, mode, week, tomorrow, familyCount, kidCount])

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
    <>
      <TopBar
        actions={
          totalCount > 0 ? (
            <p className="text-sm text-ink-soft nums">
              <span className="font-display text-[19px] text-ink">{toBuyCount}</span>
              <span className="text-ink-faint"> / {totalCount} left</span>
            </p>
          ) : undefined
        }
      />
      <div className="screen">
        <ScreenHeader eyebrow="Market List" title="Shop" />
        <p className="text-[12px] text-ink-faint mt-1">Quantities for your family ({familyCount}{kidCount > 0 ? `, kid items ×${kidCount}` : ''}).</p>

        <SegmentedTabs
          ariaLabel="Shop range"
          value={mode}
          onChange={setMode}
          options={[
            ['week', 'This Week'],
            ['tomorrow', 'Just Tomorrow'],
          ] as const}
        />

        {error && <p className="text-terracotta-dark text-sm mt-2">{error}</p>}

        <div className="mt-4">
          {loading ? (
            <p className="text-ink-soft text-center">Loading…</p>
          ) : (
            <ShoppingList rows={rows} onToggle={handleToggle} />
          )}
        </div>
      </div>
    </>
  )
}

function dedupeOccurrences(
  occ: { recipe: { id: string; name: string; ingredients: { amount: string; item: string; staple?: boolean }[] }; scale: number }[],
) {
  const byId = new Map<string, { recipe: typeof occ[number]['recipe']; scale: number }>()
  for (const o of occ) {
    const prev = byId.get(o.recipe.id)
    if (!prev || o.scale > prev.scale) byId.set(o.recipe.id, o)
  }
  return [...byId.values()]
}
