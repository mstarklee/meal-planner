import { useEffect, useState } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import { supabase } from '../lib/supabase'
import { todayDate, formatDisplayDate, greeting } from '../lib/mealPlan'
import type { DailyPick, PickSlot } from '../lib/mealPlan'
import { getPicksForDate } from '../lib/mealPlans'
import { defaultTargets } from '../lib/householdDefaults'
import NutritionStrip from '../components/NutritionStrip'
import MealCard from '../components/MealCard'

const FAMILY_SLOTS: { slot: PickSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'dinner', label: 'Dinner' },
]

const KID_SLOTS: { slot: PickSlot; label: string }[] = [
  { slot: 'kid-lunch', label: 'School Lunch' },
  { slot: 'kid-snack', label: 'Snack' },
]

export default function Today() {
  const { householdId, kids, settings, displayName } = useHousehold()
  const [picks, setPicks] = useState<DailyPick[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = todayDate()

  useEffect(() => {
    if (!householdId) return
    let active = true
    void (async () => {
      setLoading(true)
      try {
        const data = await getPicksForDate(householdId, today)
        if (active) setPicks(data)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [householdId, today])

  const pickBySlot = new Map(picks.map((p) => [p.slot, p]))
  const targets = settings ?? defaultTargets()

  const totals = picks.reduce(
    (acc, p) => ({
      calories: acc.calories + (p.recipe.calories ?? 0),
      protein: acc.protein + (p.recipe.protein ?? 0),
      fiber: acc.fiber + (p.recipe.fiber ?? 0),
    }),
    { calories: 0, protein: 0, fiber: 0 },
  )

  const hasKids = kids.length > 0
  const hasPicks = picks.length > 0

  return (
    <div className="px-4 pt-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand">
            {greeting()}{displayName ? `, ${displayName}` : ''}
          </h1>
          <p className="text-sm text-gray-500">{formatDisplayDate(today)}</p>
        </div>
        <button className="text-sm text-gray-400" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : !hasPicks ? (
        <div className="text-center py-10 space-y-2">
          <p className="text-gray-400 text-4xl">🍽️</p>
          <p className="text-gray-500">No meals planned for today.</p>
          <p className="text-sm text-gray-400">Go to the Plan tab to set up tomorrow's meals.</p>
        </div>
      ) : (
        <>
          {/* Nutrition strip */}
          <NutritionStrip
            totals={totals}
            targets={{ calories: targets.target_calories, protein: targets.target_protein, fiber: targets.target_fiber }}
          />

          {/* Family meals */}
          <div className="space-y-3">
            {FAMILY_SLOTS.map(({ slot, label }) => {
              const pick = pickBySlot.get(slot)
              if (!pick) return null
              return <MealCard key={slot} recipe={pick.recipe} label={label} />
            })}
          </div>

          {/* Kid's school box */}
          {hasKids && (pickBySlot.has('kid-lunch') || pickBySlot.has('kid-snack')) && (
            <div>
              <h2 className="text-xs font-bold text-kid uppercase mb-2">Kid's School Box</h2>
              <div className="space-y-3">
                {KID_SLOTS.map(({ slot, label }) => {
                  const pick = pickBySlot.get(slot)
                  if (!pick) return null
                  return <MealCard key={slot} recipe={pick.recipe} label={label} isKid />
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
