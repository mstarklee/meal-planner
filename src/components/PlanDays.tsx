import { useEffect, useState } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import {
  PICK_SLOTS, PICK_SLOT_LABELS, poolSlotFor, weekStartDate, planDays, todayDate,
} from '../lib/mealPlan'
import type { PickSlot, PoolEntry } from '../lib/mealPlan'
import { getFullPool, getPicksForDate, setPick, clearPick } from '../lib/mealPlans'

interface Props {
  initialDate?: string
}

export default function PlanDays({ initialDate }: Props) {
  const { householdId, kids } = useHousehold()
  const days = planDays()
  const [selectedDate, setSelectedDate] = useState<string>(initialDate ?? todayDate())
  const [pool, setPool] = useState<PoolEntry[]>([])
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const week = weekStartDate(new Date(selectedDate + 'T00:00:00'))
  const slots = kids.length > 0
    ? PICK_SLOTS
    : PICK_SLOTS.filter((s) => s !== 'kid-lunch' && s !== 'kid-snack')

  useEffect(() => {
    if (!householdId) return
    let active = true
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [poolData, existingPicks] = await Promise.all([
          getFullPool(householdId, week),
          getPicksForDate(householdId, selectedDate),
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
  }, [householdId, week, selectedDate])

  function poolForSlot(slot: PickSlot): PoolEntry[] {
    return pool.filter((e) => e.slot === poolSlotFor(slot))
  }

  async function handleTap(slot: PickSlot, recipeId: string) {
    if (!householdId) return
    const prev = picks
    const isSelected = prev[slot] === recipeId
    const next = { ...prev }
    if (isSelected) { delete next[slot] } else { next[slot] = recipeId }
    setPicks(next)
    setError(null)
    try {
      if (isSelected) {
        await clearPick(householdId, slot, selectedDate)
      } else {
        await setPick(householdId, recipeId, slot, selectedDate)
      }
    } catch (e) {
      setPicks(prev)
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  return (
    <div className="space-y-5">
      {/* Date strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4" role="tablist" aria-label="Day">
        {days.map((d) => {
          const selected = d.date === selectedDate
          return (
            <button key={d.date} type="button" role="tab" aria-selected={selected}
              onClick={() => setSelectedDate(d.date)}
              className={`shrink-0 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap ${
                selected ? 'bg-brand text-white' : 'bg-brand-soft text-gray-600'
              }`}>
              {d.label}
            </button>
          )
        })}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-center">Loading...</p>
      ) : (
        slots.map((slot) => {
          const slotPool = poolForSlot(slot)
          const isKid = slot === 'kid-lunch' || slot === 'kid-snack'
          return (
            <div key={slot}>
              <h3 className={`text-xs font-bold uppercase mb-2 ${isKid ? 'text-kid' : 'text-gray-500'}`}>
                {PICK_SLOT_LABELS[slot]}
              </h3>
              {slotPool.length === 0 ? (
                <p className="text-sm text-gray-400">No recipes in this week's pool. Add some in the Pool tab.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
                  {slotPool.map((entry) => {
                    const selected = picks[slot] === entry.recipe_id
                    return (
                      <button key={entry.id} type="button" onClick={() => handleTap(slot, entry.recipe_id)}
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
        })
      )}
    </div>
  )
}
