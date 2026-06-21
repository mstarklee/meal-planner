import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useHousehold } from '../context/HouseholdProvider'
import { todayDate, formatDisplayDate, greeting } from '../lib/mealPlan'
import type { DailyPick, PickSlot } from '../lib/mealPlan'
import { getPicksForDate } from '../lib/mealPlans'
import { defaultTargets } from '../lib/householdDefaults'
import NutritionStrip from '../components/NutritionStrip'
import MealCard from '../components/MealCard'
import ScreenHeader from '../components/ScreenHeader'
import TopBar from '../components/TopBar'
import Icon from '../components/Icon'
import { Stagger, StaggerItem } from '../components/motion'

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
  const navigate = useNavigate()

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
    <>
      <TopBar
        actions={
          <Link
            to="/settings"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink-soft transition-colors hover:bg-ink/5"
          >
            <Icon name="settings" size={18} />
          </Link>
        }
      />
      <div className="screen">
        <ScreenHeader
          size="md"
          eyebrow={formatDisplayDate(today)}
          title={`${greeting()}${displayName ? `, ${displayName}` : ''}`}
        />

      {loading ? (
        <p className="text-ink-soft">Loading…</p>
      ) : error ? (
        <p className="text-terracotta-dark text-sm">{error}</p>
      ) : !hasPicks ? (
        <div className="py-20 text-center">
          <div className="mx-auto mb-5 h-px w-12 bg-ink/15" />
          <p className="font-display text-[26px] font-light italic text-ink">Nothing planned yet.</p>
          <p className="mt-2 text-[14px] text-ink-soft">Head to the Plan tab to set up tomorrow&apos;s meals.</p>
        </div>
      ) : (
        <Stagger className="space-y-7 pt-1">
          <StaggerItem>
            <NutritionStrip
              totals={totals}
              targets={{ calories: targets.target_calories, protein: targets.target_protein, fiber: targets.target_fiber }}
            />
          </StaggerItem>

          {/* Family meals */}
          <StaggerItem className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Today&apos;s Table</h2>
              <button
                type="button"
                onClick={() => navigate('/plan', { state: { mode: 'days', date: today } })}
                className="flex items-center gap-1 text-[13px] font-semibold text-terracotta transition-colors hover:text-terracotta-dark"
              >
                <Icon name="edit" size={14} /> Edit meals
              </button>
            </div>
            {FAMILY_SLOTS.map(({ slot, label }) => {
              const pick = pickBySlot.get(slot)
              if (!pick) return null
              return <MealCard key={slot} recipe={pick.recipe} label={label} />
            })}
          </StaggerItem>

          {/* Kid's school box */}
          {hasKids && (pickBySlot.has('kid-lunch') || pickBySlot.has('kid-snack')) && (
            <StaggerItem className="space-y-3">
              <h2 className="eyebrow mb-1 text-olive">Kid&apos;s School Box</h2>
              {KID_SLOTS.map(({ slot, label }) => {
                const pick = pickBySlot.get(slot)
                if (!pick) return null
                return <MealCard key={slot} recipe={pick.recipe} label={label} isKid />
              })}
            </StaggerItem>
          )}
        </Stagger>
      )}
      </div>
    </>
  )
}
