# Meal Planner — Plan & Today (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Start by creating a feature branch (e.g. `feat/plan-today`) off `main`; do NOT commit directly to `main`.

**Goal:** Build the Plan screen (weekly recipe pool + nightly "Plan Tomorrow" pick flow) and the Today screen (daily meal cards with accordion steps + nutrition rollup against household targets). This is the core meal-planning loop: shortlist weekly → pick nightly → cook today.

**Architecture:** Two new Supabase tables — `week_pool` (links recipes to meal slots for a given week) and `daily_picks` (the recipe chosen for each slot on a specific date). Both scoped to `household_id` with RLS via the existing `current_household_id()` helper. The Plan screen has two modes toggled by tabs: **Pool** (manage this week's shortlist per slot) and **Tomorrow** (pick one recipe per slot from the pool, lock in). The Today screen fetches today's picks, renders accordion meal cards, and shows a green nutrition strip comparing daily totals against the household's targets. Kid meal slots (`kid-lunch`, `kid-snack`) are conditionally shown based on whether the household has kids.

**Tech Stack (already in place):** React 19 + TS + Vite PWA, Tailwind v3 (pinned 3.4.19), `@supabase/supabase-js` 2, `zod` 4, `react-router-dom` 7, Vitest 4. The Supabase client is `src/lib/supabase.ts` (`supabase`). `useHousehold()` exposes `{ householdId, kids }`. `current_household_id()` SQL helper exists. Brand Tailwind colors: `brand` (DEFAULT `#2e7d52`, `dark`, `soft`, `mint`), `kid` (`#e6a23c`), `cheat` (`#c8783a`).

> **Conventions to match:** Supabase query results are cast to the expected shape (no generated DB types). Default exports for route screens. Named exports for lib modules. Verify each task with `npx tsc -b`. The migration is a committed artifact applied manually in the Supabase dashboard. User prefers **no TDD** — implement directly, verify with type-check and manual testing.

---

## File Structure

```
supabase/migrations/
└── 0004_meal_plans.sql              # week_pool + daily_picks tables, RLS

src/
├── lib/
│   ├── mealPlan.ts                  # Types (PoolSlot, PickSlot, PoolEntry, DailyPick) + date utils
│   └── mealPlans.ts                 # Supabase CRUD: pool ops, daily picks, recipe-by-slot query
├── context/
│   └── HouseholdProvider.tsx        # MODIFY: add settings + displayName to context
├── components/
│   ├── PoolManager.tsx              # Pool tab: slot tabs, recipe grid with pool toggles, counter
│   ├── PlanTomorrow.tsx             # Tomorrow tab: per-slot picker from pool, lock-in button
│   ├── NutritionStrip.tsx           # Green bar: cal/protein/fiber vs targets
│   └── MealCard.tsx                 # Accordion card: tap to unfold ingredients/steps
├── routes/
│   ├── Plan.tsx                     # REWRITE: Pool/Tomorrow toggle, delegates to components
│   └── Today.tsx                    # REWRITE: greeting, nutrition strip, meal cards, kid box
```

---

## Task 1: Migration `0004_meal_plans.sql`

**Files:** Create `supabase/migrations/0004_meal_plans.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Weekly recipe pool: ~7 recipes per slot per week
create table week_pool (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  slot text not null check (slot in ('breakfast','lunch','dinner','kid')),
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (household_id, recipe_id, slot, week_start)
);

create index week_pool_household_week_idx on week_pool (household_id, week_start);

alter table week_pool enable row level security;

create policy "week_pool read" on week_pool for select
  using (household_id = current_household_id());
create policy "week_pool insert" on week_pool for insert
  with check (household_id = current_household_id());
create policy "week_pool delete" on week_pool for delete
  using (household_id = current_household_id());

-- Daily picks: one recipe per slot per day (the nightly "lock in tomorrow" result)
create table daily_picks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  slot text not null check (slot in ('breakfast','lunch','dinner','kid-lunch','kid-snack')),
  pick_date date not null,
  created_at timestamptz not null default now(),
  unique (household_id, slot, pick_date)
);

create index daily_picks_household_date_idx on daily_picks (household_id, pick_date);

alter table daily_picks enable row level security;

create policy "daily_picks read" on daily_picks for select
  using (household_id = current_household_id());
create policy "daily_picks insert" on daily_picks for insert
  with check (household_id = current_household_id());
create policy "daily_picks delete" on daily_picks for delete
  using (household_id = current_household_id());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0004_meal_plans.sql
git commit -m "feat: week_pool + daily_picks tables with RLS"
```

---

## Task 2: Types + date utilities (`src/lib/mealPlan.ts`)

**Files:** Create `src/lib/mealPlan.ts`.

- [ ] **Step 1: Write types and utilities**

```ts
import type { Recipe } from './recipe'

export const POOL_SLOTS = ['breakfast', 'lunch', 'dinner', 'kid'] as const
export type PoolSlot = (typeof POOL_SLOTS)[number]

export const PICK_SLOTS = ['breakfast', 'lunch', 'dinner', 'kid-lunch', 'kid-snack'] as const
export type PickSlot = (typeof PICK_SLOTS)[number]

export const POOL_SLOT_LABELS: Record<PoolSlot, string> = {
  breakfast: "B'fast",
  lunch: 'Lunch',
  dinner: 'Dinner',
  kid: 'Kid',
}

export const PICK_SLOT_LABELS: Record<PickSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  'kid-lunch': 'School Lunch',
  'kid-snack': 'Snack',
}

export function poolSlotFor(pick: PickSlot): PoolSlot {
  if (pick === 'kid-lunch' || pick === 'kid-snack') return 'kid'
  return pick as PoolSlot
}

export interface PoolEntry {
  id: string
  household_id: string
  recipe_id: string
  slot: PoolSlot
  week_start: string
  recipe: Recipe
}

export interface DailyPick {
  id: string
  household_id: string
  recipe_id: string
  slot: PickSlot
  pick_date: string
  recipe: Recipe
}

export function weekStartDate(d: Date = new Date()): string {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy.toISOString().slice(0, 10)
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function tomorrowDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass with zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mealPlan.ts
git commit -m "feat: meal plan types, slot definitions, and date utilities"
```

---

## Task 3: Data layer (`src/lib/mealPlans.ts`)

**Files:** Create `src/lib/mealPlans.ts`.

- [ ] **Step 1: Write the data access module**

```ts
import { supabase } from './supabase'
import type { Recipe } from './recipe'
import type { PoolSlot, PickSlot, PoolEntry, DailyPick } from './mealPlan'
import { tomorrowDate } from './mealPlan'
import type { HouseholdSettings } from './householdDefaults'

export async function getPool(householdId: string, slot: PoolSlot, weekStart: string): Promise<PoolEntry[]> {
  const { data, error } = await supabase
    .from('week_pool')
    .select('*, recipe:recipes(*)')
    .eq('household_id', householdId)
    .eq('slot', slot)
    .eq('week_start', weekStart)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as PoolEntry[]
}

export async function getFullPool(householdId: string, weekStart: string): Promise<PoolEntry[]> {
  const { data, error } = await supabase
    .from('week_pool')
    .select('*, recipe:recipes(*)')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as PoolEntry[]
}

export async function addToPool(householdId: string, recipeId: string, slot: PoolSlot, weekStart: string): Promise<void> {
  const { error } = await supabase
    .from('week_pool')
    .insert({ household_id: householdId, recipe_id: recipeId, slot, week_start: weekStart })
  if (error) throw error
}

export async function removeFromPool(entryId: string): Promise<void> {
  const { error } = await supabase.from('week_pool').delete().eq('id', entryId)
  if (error) throw error
}

export async function listRecipesForSlot(slot: PoolSlot): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .contains('meal_types', [slot])
    .order('name')
  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function getPicksForDate(householdId: string, date: string): Promise<DailyPick[]> {
  const { data, error } = await supabase
    .from('daily_picks')
    .select('*, recipe:recipes(*)')
    .eq('household_id', householdId)
    .eq('pick_date', date)
  if (error) throw error
  return (data ?? []) as DailyPick[]
}

export async function lockInTomorrow(householdId: string, picks: { recipeId: string; slot: PickSlot }[]): Promise<void> {
  const date = tomorrowDate()
  const { error: delErr } = await supabase
    .from('daily_picks')
    .delete()
    .eq('household_id', householdId)
    .eq('pick_date', date)
  if (delErr) throw delErr
  if (picks.length === 0) return
  const rows = picks.map((p) => ({
    household_id: householdId,
    recipe_id: p.recipeId,
    slot: p.slot,
    pick_date: date,
  }))
  const { error } = await supabase.from('daily_picks').insert(rows)
  if (error) throw error
}

export async function getHouseholdSettings(householdId: string): Promise<HouseholdSettings> {
  const { data, error } = await supabase
    .from('household_settings')
    .select('target_calories, target_protein, target_fiber, evening_reminder_time, morning_reminder_time')
    .eq('household_id', householdId)
    .single()
  if (error) throw error
  return data as HouseholdSettings
}
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass with zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mealPlans.ts
git commit -m "feat: data layer for week pool and daily picks"
```

---

## Task 4: Expand HouseholdProvider with settings + display name

**Files:** Modify `src/context/HouseholdProvider.tsx`.

- [ ] **Step 1: Add `settings` and `displayName` to the context**

The full updated file should be:

```tsx
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'
import type { HouseholdSettings } from '../lib/householdDefaults'

interface Kid { id: string; name: string }
interface HouseholdState {
  householdId: string | null
  kids: Kid[]
  settings: HouseholdSettings | null
  displayName: string | null
  loading: boolean
  refresh: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState>({
  householdId: null, kids: [], settings: null, displayName: null, loading: true, refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [kids, setKids] = useState<Kid[]>([])
  const [settings, setSettings] = useState<HouseholdSettings | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (authLoading) { return }
    if (!session) { setHouseholdId(null); setKids([]); setSettings(null); setDisplayName(null); setLoading(false); return }
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles').select('household_id, display_name').eq('id', session.user.id).single()
    const hid = (profile as { household_id: string | null; display_name: string | null } | null)?.household_id ?? null
    const name = (profile as { household_id: string | null; display_name: string | null } | null)?.display_name ?? null
    setHouseholdId(hid)
    setDisplayName(name)
    if (hid) {
      const { data: k } = await supabase.from('kids').select('id,name').eq('household_id', hid)
      setKids((k ?? []) as Kid[])
      const { data: s } = await supabase
        .from('household_settings').select('*').eq('household_id', hid).maybeSingle()
      setSettings(s as HouseholdSettings | null)
    } else {
      setKids([])
      setSettings(null)
    }
    setLoading(false)
  }, [session, authLoading])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <HouseholdContext.Provider value={{ householdId, kids, settings, displayName, loading, refresh }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 3: Commit**

```bash
git add src/context/HouseholdProvider.tsx
git commit -m "feat: add settings and displayName to HouseholdProvider"
```

---

## Task 5: Plan screen — Pool management

**Files:** Create `src/components/PoolManager.tsx`, modify `src/routes/Plan.tsx`.

- [ ] **Step 1: Create `src/components/PoolManager.tsx`**

This component shows: slot tabs → counter → recipe grid with pool toggles.

```tsx
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
        <p className="text-gray-500 text-center">Loading…</p>
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
```

- [ ] **Step 2: Rewrite `src/routes/Plan.tsx`**

Replace the placeholder with the full Plan screen. Initially wire up only the Pool tab; the Tomorrow tab will be added in Task 6.

```tsx
import { useState } from 'react'
import PoolManager from '../components/PoolManager'

type PlanMode = 'pool' | 'tomorrow'

export default function Plan() {
  const [mode, setMode] = useState<PlanMode>('pool')

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-brand">Plan</h1>

      {/* Mode toggle */}
      <div role="tablist" aria-label="Plan mode" className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['pool', "This Week's Pool"],
          ['tomorrow', 'Plan Tomorrow'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              mode === value ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {mode === 'pool' ? (
          <PoolManager />
        ) : (
          <p className="text-gray-500 text-center">Plan Tomorrow — coming in Task 6.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/PoolManager.tsx src/routes/Plan.tsx
git commit -m "feat: Plan screen with weekly pool management"
```

---

## Task 6: Plan screen — Plan Tomorrow

**Files:** Create `src/components/PlanTomorrow.tsx`, modify `src/routes/Plan.tsx`.

- [ ] **Step 1: Create `src/components/PlanTomorrow.tsx`**

Shows each pick slot with its pool recipes in a horizontal scroll. User taps one per slot. "Lock in tomorrow" button at the bottom.

```tsx
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

  if (loading) return <p className="text-gray-500 text-center">Loading…</p>

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
          {saving ? 'Saving…' : 'Lock in tomorrow'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire PlanTomorrow into `src/routes/Plan.tsx`**

Replace the placeholder text in the `mode === 'tomorrow'` branch:

```tsx
import { useState } from 'react'
import PoolManager from '../components/PoolManager'
import PlanTomorrow from '../components/PlanTomorrow'

type PlanMode = 'pool' | 'tomorrow'

export default function Plan() {
  const [mode, setMode] = useState<PlanMode>('pool')

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-brand">Plan</h1>

      <div role="tablist" aria-label="Plan mode" className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['pool', "This Week's Pool"],
          ['tomorrow', 'Plan Tomorrow'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              mode === value ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {mode === 'pool' ? <PoolManager /> : <PlanTomorrow />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/PlanTomorrow.tsx src/routes/Plan.tsx
git commit -m "feat: Plan Tomorrow flow with lock-in"
```

---

## Task 7: Today screen components (NutritionStrip + MealCard)

**Files:** Create `src/components/NutritionStrip.tsx` and `src/components/MealCard.tsx`.

- [ ] **Step 1: Create `src/components/NutritionStrip.tsx`**

Green bar showing cal / protein / fiber vs. household targets.

```tsx
interface NutritionStripProps {
  totals: { calories: number; protein: number; fiber: number }
  targets: { calories: number; protein: number; fiber: number }
}

export default function NutritionStrip({ totals, targets }: NutritionStripProps) {
  const items = [
    { label: 'Cal', actual: totals.calories, target: targets.calories, unit: '' },
    { label: 'Protein', actual: totals.protein, target: targets.protein, unit: 'g' },
    { label: 'Fiber', actual: totals.fiber, target: targets.fiber, unit: 'g' },
  ]

  return (
    <div className="bg-brand-mint rounded-xl p-3 flex justify-around">
      {items.map(({ label, actual, target, unit }) => {
        const met = actual >= target
        return (
          <div key={label} className="text-center">
            <p className="text-[10px] font-semibold text-gray-500 uppercase">{label}</p>
            <p className={`text-sm font-bold ${met ? 'text-brand' : 'text-gray-700'}`}>
              {actual}{unit} / {target}{unit}
            </p>
            {met && <span className="text-brand text-xs">✓</span>}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/MealCard.tsx`**

Accordion meal card: tap to unfold ingredients, steps, and optional video/blog link.

```tsx
import { useState } from 'react'
import type { Recipe } from '../lib/recipe'

interface MealCardProps {
  recipe: Recipe
  label: string
  isKid?: boolean
}

function nutritionLine(recipe: Recipe): string | null {
  const parts: string[] = []
  if (recipe.calories !== null) parts.push(`${recipe.calories}cal`)
  if (recipe.protein !== null) parts.push(`${recipe.protein}g protein`)
  if (recipe.fiber !== null) parts.push(`${recipe.fiber}g fiber`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function MealCard({ recipe, label, isKid }: MealCardProps) {
  const [open, setOpen] = useState(false)
  const nutrition = nutritionLine(recipe)

  return (
    <div className={`rounded-xl border overflow-hidden bg-white shadow-sm ${
      isKid ? 'border-kid/40' : 'border-gray-200'
    }`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex gap-3 p-3">
          {recipe.photo_url ? (
            <img src={recipe.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-brand-soft flex items-center justify-center text-2xl shrink-0">
              🍽️
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-bold uppercase ${isKid ? 'text-kid' : 'text-gray-400'}`}>{label}</p>
            <h3 className="font-bold text-gray-900 truncate">{recipe.name}</h3>
            {nutrition && <p className="text-xs text-gray-500 mt-0.5">{nutrition}</p>}
            {recipe.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {recipe.tags.map((tag) => (
                  <span key={tag}
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                      tag === 'cheat'
                        ? 'bg-orange-100 text-cheat'
                        : 'bg-brand-mint text-brand-dark'
                    }`}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="self-center text-gray-300 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
          {recipe.ingredients.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase">Ingredients</h4>
              <ul className="mt-1 space-y-0.5">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm text-gray-900">
                    {ing.amount ? `${ing.amount} ${ing.item}` : ing.item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.steps.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase">Steps</h4>
              <ol className="mt-1 space-y-1 list-decimal list-inside">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="text-sm text-gray-900">{step}</li>
                ))}
              </ol>
            </div>
          )}

          {recipe.link_url && (
            <a href={recipe.link_url} target="_blank" rel="noreferrer"
              className="inline-block bg-brand text-white font-bold rounded-lg px-3 py-1.5 text-xs">
              ▶ Watch video / open blog
            </a>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/NutritionStrip.tsx src/components/MealCard.tsx
git commit -m "feat: NutritionStrip and MealCard accordion components"
```

---

## Task 8: Today screen

**Files:** Rewrite `src/routes/Today.tsx`.

- [ ] **Step 1: Rewrite `src/routes/Today.tsx`**

Full Today screen: greeting + date, nutrition strip, family meal cards, kid's school box (conditional), empty state, sign-out.

```tsx
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
        <p className="text-gray-500">Loading…</p>
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
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Today.tsx
git commit -m "feat: Today screen with nutrition strip and accordion meal cards"
```

---

## Post-Implementation Checklist

After all tasks are complete:

1. **Apply migration:** Paste `supabase/migrations/0004_meal_plans.sql` into the Supabase dashboard SQL Editor and run.

2. **Manual E2E test flow:**
   - Go to Plan → Pool tab → pick a slot → toggle recipes into the pool
   - Switch to Tomorrow tab → pick one per slot → tap "Lock in tomorrow"
   - Navigate to Today → verify meals appear with correct nutrition strip
   - Tap a meal card → verify steps/ingredients unfold
   - If household has kids: verify kid slots appear in both Plan and Today

3. **Verify type-check:** `npx tsc -b` passes cleanly.

4. **Merge:** Once verified, merge `feat/plan-today` into `main`.
