import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useHousehold } from '../context/HouseholdProvider'
import { POOL_SLOTS, POOL_SLOT_LABELS, weekStartDate, nextWeekStartDate } from '../lib/mealPlan'
import type { PoolSlot, PoolEntry } from '../lib/mealPlan'
import type { Recipe } from '../lib/recipe'
import { toNutrientMap } from '../lib/recipe'
import { getPool, addToPool, removeFromPool, listRecipesForSlot } from '../lib/mealPlans'
import { springSoft } from './motion'

const POOL_TARGET = 7

// Compact "is this the right one?" line — the headline macros, per person.
function macroLine(recipe: Recipe): string {
  const m = toNutrientMap(recipe.nutrients)
  const parts: string[] = []
  if (typeof m.calories === 'number') parts.push(`${Math.round(m.calories)} cal`)
  if (typeof m.protein === 'number') parts.push(`${Math.round(m.protein)}g protein`)
  if (typeof m.fiber === 'number') parts.push(`${Math.round(m.fiber)}g fiber`)
  return parts.join('  ·  ')
}

export default function PoolManager() {
  const { householdId, kids } = useHousehold()
  const [slot, setSlot] = useState<PoolSlot>('breakfast')
  const [pool, setPool] = useState<PoolEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [weekSel, setWeekSel] = useState<'this' | 'next'>('this')
  const week = weekSel === 'this' ? weekStartDate() : nextWeekStartDate()
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
  const filled = Math.min(pool.length, POOL_TARGET)
  const reached = pool.length >= POOL_TARGET

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
    <div className="space-y-5">
      {/* Week — primary segmented control */}
      <div role="tablist" aria-label="Pool week" className="grid grid-cols-2 gap-1 rounded-full bg-bone-deep p-1">
        {([
          ['this', 'This week'],
          ['next', 'Next week'],
        ] as const).map(([value, label]) => {
          const active = weekSel === value
          return (
            <button key={value} type="button" role="tab" aria-selected={active}
              onClick={() => setWeekSel(value)}
              className={`rounded-full py-2 text-[13px] font-semibold transition-colors ${
                active ? 'bg-terracotta text-bone-surface shadow-soft' : 'text-ink-soft'
              }`}>
              {label}
            </button>
          )
        })}
      </div>

      {/* Slot — airy chip row */}
      <div role="tablist" aria-label="Meal slot" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {slots.map((s) => {
          const active = slot === s
          return (
            <button key={s} type="button" role="tab" aria-selected={active}
              onClick={() => setSlot(s)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                active
                  ? 'bg-terracotta-soft text-terracotta-dark ring-1 ring-terracotta/40'
                  : 'text-ink-faint hover:text-ink-soft'
              }`}>
              {POOL_SLOT_LABELS[s]}
            </button>
          )
        })}
      </div>

      {/* Progress meter */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">{reached ? 'Pool ready' : 'Building your pool'}</p>
          <p className="text-[13px] text-ink-soft nums">
            <span className={`font-display text-[16px] ${reached ? 'text-olive-dark' : 'text-ink'}`}>{pool.length}</span>
            <span className="text-ink-faint"> / {POOL_TARGET}</span>
          </p>
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-ink/10">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: reached ? '#5e6b3f' : '#b8512e' }}
            animate={{ width: `${(filled / POOL_TARGET) * 100}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-10 text-center font-display text-[15px] italic text-ink-faint">Gathering recipes…</p>
      ) : recipes.length === 0 ? (
        <p className="py-10 text-center font-display text-[15px] italic text-ink-faint">
          No recipes match this slot yet. Add some in the Recipes tab.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {recipes.map((recipe) => {
            const inPool = poolRecipeIds.has(recipe.id)
            const initial = recipe.name.trim().charAt(0).toUpperCase() || '·'
            const macros = macroLine(recipe)
            const tags = recipe.tags.filter((t) => t !== 'cheat').slice(0, 2)
            return (
              <li key={recipe.id}>
                <motion.button type="button" onClick={() => toggle(recipe)}
                  whileTap={{ scale: 0.985 }} transition={springSoft} aria-pressed={inPool}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${
                    inPool ? 'border-terracotta bg-terracotta-soft/50' : 'border-ink/10 bg-bone-surface/50 hover:bg-bone-surface'
                  }`}>
                  {/* small thumbnail */}
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-bone-deep">
                    {recipe.photo_url ? (
                      <img src={recipe.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <span className="monogram absolute inset-0 text-[1.75rem] leading-none">{initial}</span>
                    )}
                  </div>
                  {/* detail */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[16px] leading-tight text-ink">{recipe.name}</p>
                    {macros && <p className="mt-1 text-[12px] text-ink-soft nums">{macros}</p>}
                    {(tags.length > 0 || recipe.tags.includes('cheat')) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {recipe.tags.includes('cheat') && (
                          <span className="rounded-full bg-terracotta px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-eyebrow text-bone-surface">cheat</span>
                        )}
                        {tags.map((t) => (
                          <span key={t} className="rounded-full bg-olive-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-eyebrow text-olive-dark">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* selection */}
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                    inPool ? 'bg-terracotta text-bone-surface' : 'border border-ink/20 text-transparent'
                  }`}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  </span>
                </motion.button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
