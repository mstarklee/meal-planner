import { useEffect, useState } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import {
  PICK_SLOTS, PICK_SLOT_LABELS, poolSlotFor, weekStartDate, tomorrowDate, formatDisplayDate,
} from '../lib/mealPlan'
import type { PickSlot, PoolEntry } from '../lib/mealPlan'
import { getFullPool, lockInTomorrow, getPicksForDate } from '../lib/mealPlans'

export default function PlanTomorrow() {
  const { householdId, kids } = useHousehold()
  const [pool, setPool] = useState<PoolEntry[]>([])
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const week = weekStartDate()
  const tomorrow = tomorrowDate()
  const slots = kids.length > 0
    ? PICK_SLOTS
    : PICK_SLOTS.filter((s) => s !== 'kid-lunch' && s !== 'kid-snack')

  useEffect(() => {
    if (!householdId) return
    let active = true
    void (async () => {
      setLoading(true)
      try {
        const [poolData, existingPicks] = await Promise.all([
          getFullPool(householdId, week),
          getPicksForDate(householdId, tomorrow),
        ])
        if (!active) return
        setPool(poolData)
        const restored: Record<string, string> = {}
        for (const p of existingPicks) { restored[p.slot] = p.recipe_id }
        setPicks(restored)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [householdId, week, tomorrow])

  function poolForSlot(slot: PickSlot): PoolEntry[] {
    return pool.filter((e) => e.slot === poolSlotFor(slot))
  }

  function selectRecipe(slot: PickSlot, recipeId: string) {
    setPicks((prev) => ({ ...prev, [slot]: prev[slot] === recipeId ? undefined! : recipeId }))
    setDone(false)
  }

  const allPicked = slots.every((s) => picks[s])

  async function handleLockIn() {
    if (!householdId || !allPicked) return
    setSaving(true)
    setError(null)
    try {
      const pickList = slots
        .filter((s) => picks[s])
        .map((s) => ({ recipeId: picks[s], slot: s }))
      await lockInTomorrow(householdId, pickList)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-gray-500 text-center">Loading...</p>

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 text-center">
        Pick meals for <span className="font-semibold text-gray-700">{formatDisplayDate(tomorrow)}</span>
      </p>

      {slots.map((slot) => {
        const slotPool = poolForSlot(slot)
        const isKid = slot === 'kid-lunch' || slot === 'kid-snack'
        return (
          <div key={slot}>
            <h3 className={`text-xs font-bold uppercase mb-2 ${isKid ? 'text-kid' : 'text-gray-500'}`}>
              {PICK_SLOT_LABELS[slot]}
            </h3>
            {slotPool.length === 0 ? (
              <p className="text-sm text-gray-400">No recipes in pool. Add some in the Pool tab.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
                {slotPool.map((entry) => {
                  const selected = picks[slot] === entry.recipe_id
                  return (
                    <button key={entry.id} type="button" onClick={() => selectRecipe(slot, entry.recipe_id)}
                      className={`shrink-0 w-28 rounded-xl border-2 overflow-hidden text-left transition-colors ${
                        selected
                          ? isKid ? 'border-kid bg-orange-50' : 'border-brand bg-brand-soft'
                          : 'border-gray-200 bg-white'
                      }`}>
                      {entry.recipe.photo_url ? (
                        <img src={entry.recipe.photo_url} alt="" className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="w-full aspect-square bg-brand-soft flex items-center justify-center text-2xl">
                          🍽️
                        </div>
                      )}
                      <p className="p-1.5 text-xs font-semibold text-gray-900 leading-tight truncate">
                        {entry.recipe.name}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {done ? (
        <div className="text-center py-3">
          <p className="text-brand font-bold">Tomorrow is locked in!</p>
        </div>
      ) : (
        <button type="button" onClick={handleLockIn} disabled={!allPicked || saving}
          className="w-full bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
          {saving ? 'Saving...' : 'Lock in tomorrow'}
        </button>
      )}
    </div>
  )
}
