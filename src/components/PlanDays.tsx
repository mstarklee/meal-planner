import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useHousehold } from '../context/HouseholdProvider'
import {
  PICK_SLOTS, PICK_SLOT_LABELS, poolSlotFor, weekStartDate, planDays, todayDate,
} from '../lib/mealPlan'
import type { PickSlot, PoolEntry } from '../lib/mealPlan'
import type { Recipe } from '../lib/recipe'
import { toNutrientMap } from '../lib/recipe'
import { getFullPool, getPicksForDate, setPick, clearPick } from '../lib/mealPlans'
import { springSoft } from './motion'

// Compact macro line so each pick is identifiable at a glance.
function macroLine(recipe: Recipe): string {
  const m = toNutrientMap(recipe.nutrients)
  const parts: string[] = []
  if (typeof m.calories === 'number') parts.push(`${Math.round(m.calories)} cal`)
  if (typeof m.protein === 'number') parts.push(`${Math.round(m.protein)}g protein`)
  return parts.join(' · ')
}

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
    <div className="space-y-6">
      {/* Date strip */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="Day">
        {days.map((d) => {
          const selected = d.date === selectedDate
          const parts = d.label.split(' ')
          const top = parts.length > 1 ? parts[0] : d.label
          const num = parts.length > 1 ? parts[1] : null
          return (
            <button key={d.date} type="button" role="tab" aria-selected={selected}
              onClick={() => setSelectedDate(d.date)}
              className={`flex shrink-0 flex-col items-center justify-center rounded-2xl px-3.5 py-2 leading-none transition-colors ${
                selected
                  ? 'bg-terracotta text-bone-surface shadow-soft'
                  : 'border border-ink/10 bg-bone-surface/60 text-ink-soft hover:bg-bone-surface'
              }`}>
              <span className="text-[10px] font-bold uppercase tracking-eyebrow">{top}</span>
              {num && <span className="mt-1 font-display text-[17px]">{num}</span>}
            </button>
          )
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-10 text-center font-display text-[15px] italic text-ink-faint">Loading your week…</p>
      ) : (
        slots.map((slot) => {
          const slotPool = poolForSlot(slot)
          const isKid = slot === 'kid-lunch' || slot === 'kid-snack'
          return (
            <div key={slot}>
              <h3 className={`eyebrow mb-3 ${isKid ? 'text-olive' : 'text-ink-faint'}`}>
                {PICK_SLOT_LABELS[slot]}
              </h3>
              {slotPool.length === 0 ? (
                <p className="text-[13px] italic text-ink-faint">No recipes in this week’s pool — add some in the Pool tab.</p>
              ) : (
                <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
                  {slotPool.map((entry) => {
                    const selected = picks[slot] === entry.recipe_id
                    const accent = isKid ? 'olive' : 'terracotta'
                    const initial = entry.recipe.name.trim().charAt(0).toUpperCase() || '·'
                    const macros = macroLine(entry.recipe)
                    return (
                      <motion.button key={entry.id} type="button" onClick={() => handleTap(slot, entry.recipe_id)}
                        whileTap={{ scale: 0.97 }} transition={springSoft} aria-pressed={selected}
                        className={`flex w-[208px] shrink-0 items-center gap-2.5 rounded-2xl border p-2 text-left transition-colors ${
                          selected
                            ? accent === 'olive' ? 'border-olive bg-olive-soft/50' : 'border-terracotta bg-terracotta-soft/50'
                            : 'border-ink/10 bg-bone-surface/50 hover:bg-bone-surface'
                        }`}>
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bone-deep">
                          {entry.recipe.photo_url ? (
                            <img src={entry.recipe.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                          ) : (
                            <span className="monogram absolute inset-0 text-[1.5rem] leading-none">{initial}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-[14px] leading-tight text-ink">{entry.recipe.name}</p>
                          {macros && <p className="mt-0.5 truncate text-[11px] text-ink-soft nums">{macros}</p>}
                        </div>
                        {selected && (
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-bone-surface ${
                            accent === 'olive' ? 'bg-olive' : 'bg-terracotta'
                          }`}>
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                          </span>
                        )}
                      </motion.button>
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
