# Flexible Plan (Pool Weeks + Any-Day Picks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Plan screen flexible — stock This Week / Next Week pools, and assign or change meals for any day across both weeks with immediate per-meal save.

**Architecture:** Pure frontend. No SQL/migration. Generalize the two components that hardcode "this week" and "tomorrow"; add date helpers and two delete-then-insert data functions (`daily_picks` has no UPDATE RLS policy, so per-slot save is delete-then-insert).

**Tech Stack:** React 19 + TS + Vite, Supabase (Postgres + RLS), Vitest, Tailwind v3.

**Reference spec:** `docs/superpowers/specs/2026-06-21-flexible-plan-pool-weeks-and-days-design.md`

---

## File Structure

- **Modify** `src/lib/mealPlan.ts` — add `nextWeekStartDate`, `addDays`, `planDays` (pure date helpers).
- **Create** `src/lib/mealPlan.test.ts` — unit tests for the new date helpers.
- **Modify** `src/lib/mealPlans.ts` — remove `lockInTomorrow`; add `setPick`, `clearPick`.
- **Modify** `src/components/PoolManager.tsx` — This Week / Next Week toggle.
- **Create** `src/components/PlanDays.tsx` — date strip + immediate per-meal pick.
- **Delete** `src/components/PlanTomorrow.tsx`.
- **Modify** `src/routes/Plan.tsx` — tabs become Pool / Days; accept deep-link state.
- **Modify** `src/routes/Today.tsx` — "Edit" deep-link into Days.

---

## Task 1: Date helpers in `mealPlan.ts`

**Files:**
- Modify: `src/lib/mealPlan.ts`
- Test: `src/lib/mealPlan.test.ts` (create)

- [ ] **Step 1: Write failing tests**

Create `src/lib/mealPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { addDays, nextWeekStartDate, planDays, weekStartDate } from './mealPlan'

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-06-21', 1)).toBe('2026-06-22')
  })
  it('crosses a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
  })
  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('nextWeekStartDate', () => {
  it('is exactly 7 days after the week start', () => {
    const d = new Date('2026-06-21T12:00:00Z')
    expect(nextWeekStartDate(d)).toBe(addDays(weekStartDate(d), 7))
  })
})

describe('planDays', () => {
  const days = planDays(new Date('2026-06-21T12:00:00Z'))
  it('returns 14 entries starting today', () => {
    expect(days).toHaveLength(14)
    expect(days[0]).toEqual({ date: '2026-06-21', label: 'Today' })
    expect(days[1]).toEqual({ date: '2026-06-22', label: 'Tomorrow' })
  })
  it('labels later days with weekday + day-of-month (UTC)', () => {
    // 2026-06-23 is a Tuesday
    expect(days[2]).toEqual({ date: '2026-06-23', label: 'Tue 23' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mealPlan.test.ts`
Expected: FAIL — `addDays`, `nextWeekStartDate`, `planDays` are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/mealPlan.ts`, append these exports at the end of the file:

```ts
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// Pure calendar arithmetic on a YYYY-MM-DD string, done in UTC to avoid DST/timezone drift.
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function nextWeekStartDate(d: Date = new Date()): string {
  return addDays(weekStartDate(d), 7)
}

function dayStripLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return `${WEEKDAY_ABBR[d.getUTCDay()]} ${d.getUTCDate()}`
}

// 14 consecutive days starting today (this + next week). index 0 = Today, 1 = Tomorrow.
export function planDays(today: Date = new Date()): { date: string; label: string }[] {
  const start = today.toISOString().slice(0, 10)
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(start, i)
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayStripLabel(date)
    return { date, label }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mealPlan.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mealPlan.ts src/lib/mealPlan.test.ts
git commit -m "feat: add date helpers for flexible plan (addDays, nextWeekStartDate, planDays)"
```

---

## Task 2: `setPick` / `clearPick` data functions

**Files:**
- Modify: `src/lib/mealPlans.ts`

Background: `daily_picks` has `unique(household_id, slot, pick_date)` and RLS with insert/select/delete only (no UPDATE). So changing a pick = delete the existing slot+date row, then insert. `lockInTomorrow` is removed (its only consumer, `PlanTomorrow`, is deleted in Task 5).

- [ ] **Step 1: Remove `lockInTomorrow` and add the new functions**

In `src/lib/mealPlans.ts`, DELETE the entire `lockInTomorrow` function (the block starting `export async function lockInTomorrow(`). Also remove the now-unused `tomorrowDate` import if nothing else uses it — check: the import line is `import { tomorrowDate } from './mealPlan'`. After deleting `lockInTomorrow`, `tomorrowDate` is unused in this file, so remove that import line entirely.

Then add these two functions (place them after `getPicksForDate`):

```ts
export async function setPick(
  householdId: string,
  recipeId: string,
  slot: PickSlot,
  date: string,
): Promise<void> {
  const { error: delErr } = await supabase
    .from('daily_picks')
    .delete()
    .eq('household_id', householdId)
    .eq('slot', slot)
    .eq('pick_date', date)
  if (delErr) throw delErr
  const { error } = await supabase
    .from('daily_picks')
    .insert({ household_id: householdId, recipe_id: recipeId, slot, pick_date: date })
  if (error) throw error
}

export async function clearPick(
  householdId: string,
  slot: PickSlot,
  date: string,
): Promise<void> {
  const { error } = await supabase
    .from('daily_picks')
    .delete()
    .eq('household_id', householdId)
    .eq('slot', slot)
    .eq('pick_date', date)
  if (error) throw error
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/components/PlanTomorrow.tsx` (it still imports `lockInTomorrow`). That file is deleted in Task 5. No other file should error. If any OTHER file errors, stop and report.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mealPlans.ts
git commit -m "feat: setPick/clearPick (delete-then-insert) replacing lockInTomorrow"
```

---

## Task 3: This Week / Next Week toggle in `PoolManager`

**Files:**
- Modify: `src/components/PoolManager.tsx`

- [ ] **Step 1: Import `nextWeekStartDate` and add week state**

In `src/components/PoolManager.tsx`, update the import from `../lib/mealPlan` (currently `import { POOL_SLOTS, POOL_SLOT_LABELS, weekStartDate } from '../lib/mealPlan'`) to:

```ts
import { POOL_SLOTS, POOL_SLOT_LABELS, weekStartDate, nextWeekStartDate } from '../lib/mealPlan'
```

Replace the line `const week = weekStartDate()` with week-selection state:

```ts
  const [weekSel, setWeekSel] = useState<'this' | 'next'>('this')
  const week = weekSel === 'this' ? weekStartDate() : nextWeekStartDate()
```

(`useState` is already imported.)

- [ ] **Step 2: Add the week toggle to the render and react to changes**

The load effect dependency array is already `[householdId, slot, week]`, so changing `week` reloads automatically — no change needed there.

In the returned JSX, immediately INSIDE `<div className="space-y-4">` and BEFORE the `{/* Slot tabs */}` block, insert the week toggle:

```tsx
      {/* Week toggle */}
      <div role="tablist" aria-label="Pool week" className="flex bg-brand-soft rounded-xl p-1">
        {([
          ['this', 'This Week'],
          ['next', 'Next Week'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={weekSel === value}
            onClick={() => setWeekSel(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              weekSel === value ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>
```

- [ ] **Step 3: Type-check + run full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: errors ONLY in `PlanTomorrow.tsx` (deleted in Task 5); tests pass. If other errors, stop and report.

- [ ] **Step 4: Commit**

```bash
git add src/components/PoolManager.tsx
git commit -m "feat: This Week / Next Week toggle in PoolManager"
```

---

## Task 4: New `PlanDays` component (date strip + immediate per-meal save)

**Files:**
- Create: `src/components/PlanDays.tsx`

This replaces `PlanTomorrow`. It shows a 14-day date strip; for the selected day it lists each pick-slot's pool recipes (from that day's week pool) and saves each tap immediately.

- [ ] **Step 1: Create `src/components/PlanDays.tsx`**

```tsx
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
    // Optimistic update
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
      setPicks(prev) // rollback
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `PlanTomorrow.tsx` (still present, deleted next task). `PlanDays.tsx` itself must be error-free. If `PlanDays.tsx` has errors, fix them.

- [ ] **Step 3: Commit**

```bash
git add src/components/PlanDays.tsx
git commit -m "feat: PlanDays component with date strip and immediate per-meal save"
```

---

## Task 5: Wire `Plan.tsx` to Pool / Days tabs; delete `PlanTomorrow`

**Files:**
- Modify: `src/routes/Plan.tsx`
- Delete: `src/components/PlanTomorrow.tsx`

- [ ] **Step 1: Rewrite `src/routes/Plan.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import PoolManager from '../components/PoolManager'
import PlanDays from '../components/PlanDays'

type PlanMode = 'pool' | 'days'

export default function Plan() {
  const location = useLocation()
  const state = (location.state as { mode?: PlanMode; date?: string } | null) ?? null
  const [mode, setMode] = useState<PlanMode>(state?.mode ?? 'pool')

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-brand">Plan</h1>

      {/* Mode toggle */}
      <div role="tablist" aria-label="Plan mode" className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['pool', 'Pool'],
          ['days', 'Days'],
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
        {mode === 'pool' ? <PoolManager /> : <PlanDays initialDate={state?.date} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete `PlanTomorrow.tsx`**

```bash
git rm src/components/PlanTomorrow.tsx
```

- [ ] **Step 3: Type-check + run full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: NO type errors anywhere now; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Plan.tsx
git commit -m "feat: Plan screen Pool/Days tabs; remove PlanTomorrow"
```

---

## Task 6: "Edit" deep-link on the Today screen

**Files:**
- Modify: `src/routes/Today.tsx`

- [ ] **Step 1: Import `useNavigate` and `todayDate`**

In `src/routes/Today.tsx`, change the react-router import (currently `import { Link } from 'react-router-dom'`) to:

```ts
import { Link, useNavigate } from 'react-router-dom'
```

The `todayDate` import already exists (`import { todayDate, formatDisplayDate, greeting } from '../lib/mealPlan'`). Add a navigate hook inside the component, right after the existing `const today = todayDate()` line is fine; add near the other hooks:

```ts
  const navigate = useNavigate()
```

- [ ] **Step 2: Add an Edit link in the header**

In the header block, the right-side currently has only the settings link:

```tsx
        <Link to="/settings" aria-label="Settings" className="text-2xl leading-none text-gray-400">⚙️</Link>
```

Replace that single element with a small row containing an Edit button and the settings link:

```tsx
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/plan', { state: { mode: 'days', date: today } })}
            className="text-sm font-semibold text-brand">Edit</button>
          <Link to="/settings" aria-label="Settings" className="text-2xl leading-none text-gray-400">⚙️</Link>
        </div>
```

- [ ] **Step 3: Type-check + run full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Today.tsx
git commit -m "feat: Edit link from Today into the Plan Days tab"
```

---

## Self-Review Notes

- **Spec coverage:** date helpers (Task 1), setPick/clearPick + remove lockInTomorrow (Task 2), Pool week toggle (Task 3), PlanDays date strip + immediate save + empty states (Task 4), Plan tabs + deep-link state + delete PlanTomorrow (Task 5), Today Edit link (Task 6). No DB change (per spec). All spec sections mapped.
- **Type consistency:** `setPick(householdId, recipeId, slot, date)` and `clearPick(householdId, slot, date)` signatures used identically in Task 2 (def) and Task 4 (calls). `planDays()` returns `{date,label}[]` used in Task 4. `PlanMode = 'pool' | 'days'` and deep-link `state.mode`/`state.date` consistent between Task 5 (Plan) and Task 6 (Today navigate call). `PlanDays` prop `initialDate?: string` defined in Task 4, passed in Task 5.
- **Ordering note:** Tasks 2–4 intentionally leave a transient `tsc` error in `PlanTomorrow.tsx` (it imports the removed `lockInTomorrow`); it is deleted in Task 5, after which the project type-checks clean. Each task's expected output calls this out.
