import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useHousehold } from '../context/HouseholdProvider'
import {
  PICK_SLOTS, PICK_SLOT_LABELS, poolSlotFor, weekStartDate, planDays, todayDate,
} from '../lib/mealPlan'
import type { PickSlot, PoolEntry } from '../lib/mealPlan'
import { getFullPool, getPicksForDate, setPick, clearPick } from '../lib/mealPlans'
import { springSoft } from './motion'

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
                <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                  {slotPool.map((entry) => {
                    const selected = picks[slot] === entry.recipe_id
                    const accent = isKid ? 'olive' : 'terracotta'
                    const initial = entry.recipe.name.trim().charAt(0).toUpperCase() || '·'
                    return (
                      <motion.button key={entry.id} type="button" onClick={() => handleTap(slot, entry.recipe_id)}
                        whileTap={{ scale: 0.96 }} transition={springSoft}
                        className="group w-28 shrink-0 text-left" aria-pressed={selected}>
                        <div className={`relative aspect-square overflow-hidden rounded-2xl bg-bone-deep shadow-soft transition-all duration-200 ${
                          selected
                            ? `ring-2 ring-offset-2 ring-offset-bone ${accent === 'olive' ? 'ring-olive' : 'ring-terracotta'}`
                            : 'ring-1 ring-ink/10'
                        }`}>
                          {entry.recipe.photo_url ? (
                            <img src={entry.recipe.photo_url} alt=""
                              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.04]" />
                          ) : (
                            <span className="monogram absolute inset-0 text-[3rem] leading-none">{initial}</span>
                          )}
                          {selected && (
                            <span className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-bone-surface ${
                              accent === 'olive' ? 'bg-olive' : 'bg-terracotta'
                            }`}>
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 truncate font-display text-[13px] leading-tight text-ink">
                          {entry.recipe.name}
                        </p>
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
