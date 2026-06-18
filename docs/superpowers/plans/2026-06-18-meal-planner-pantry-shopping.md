# Meal Planner — Pantry & Shopping (Plan 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Start by creating a feature branch (e.g. `feat/pantry-shopping`) off `main`; do NOT commit directly to `main`.

**Goal:** Build the Pantry screen (household staple tracking with bulk status updates) and the Shopping screen (ingredient aggregation from pool/picks, minus pantry items, with check-off). These complete the weekly loop: shortlist → shop → pick → cook.

**Architecture:** Two new Supabase tables — `pantry_items` (name + Good/Low/Out status per household) and `shopping_checks` (persisted check-offs keyed by item + week). The Pantry screen supports single-tap status cycling and multi-select bulk actions. The Shopping screen derives ingredients from `week_pool` or `daily_picks` recipes, matches against pantry for "In pantry" exclusions, and sorts into three sections: to-buy, checked-off, in-pantry. No amount aggregation or aisle grouping in v1.

**Tech Stack (already in place):** React 19 + TS + Vite PWA, Tailwind v3 (pinned 3.4.19), `@supabase/supabase-js` 2, `zod` 4, `react-router-dom` 7, Vitest 4. The Supabase client is `src/lib/supabase.ts` (`supabase`). `useHousehold()` exposes `{ householdId, kids, settings, displayName }`. `current_household_id()` SQL helper exists. Brand Tailwind colors: `brand` (DEFAULT `#2e7d52`, `dark`, `soft`, `mint`), `kid` (`#e6a23c`), `cheat` (`#c8783a`).

> **Conventions to match:** Supabase query results are cast to the expected shape (no generated DB types). Default exports for route screens. Named exports for lib modules. Verify each task with `npx tsc -b`. The migration is a committed artifact applied manually in the Supabase dashboard. User prefers **no TDD** — implement directly, verify with type-check and manual testing.

---

## File Structure

```
supabase/migrations/
└── 0005_pantry_shopping.sql             # pantry_items + shopping_checks tables, RLS

src/
├── lib/
│   ├── pantry.ts                        # Types (PantryItem, PantryStatus, ShoppingCheck, ShoppingRow) + matching util
│   └── pantryData.ts                    # Supabase CRUD: pantry ops, shopping checks, ingredient derivation
├── components/
│   ├── PantryList.tsx                   # Item list with status cycling + multi-select bulk actions
│   └── ShoppingList.tsx                 # Derived shopping list with check-off + pantry matching
├── routes/
│   ├── Pantry.tsx                       # REWRITE: filter toggle, PantryList, add-item bar
│   └── Shop.tsx                         # REWRITE: mode toggle, counter, ShoppingList
```

---

## Task 1: Migration `0005_pantry_shopping.sql`

**Files:** Create `supabase/migrations/0005_pantry_shopping.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Pantry items: household staples with status tracking
create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  status text not null default 'good' check (status in ('good', 'low', 'out')),
  created_at timestamptz not null default now(),
  unique (household_id, lower(name))
);

create index pantry_items_household_idx on pantry_items (household_id);

alter table pantry_items enable row level security;

create policy "pantry_items read" on pantry_items for select
  using (household_id = current_household_id());
create policy "pantry_items insert" on pantry_items for insert
  with check (household_id = current_household_id());
create policy "pantry_items update" on pantry_items for update
  using (household_id = current_household_id());
create policy "pantry_items delete" on pantry_items for delete
  using (household_id = current_household_id());

-- Shopping checks: persisted check-offs per item per week
create table shopping_checks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item text not null,
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (household_id, item, week_start)
);

create index shopping_checks_household_week_idx on shopping_checks (household_id, week_start);

alter table shopping_checks enable row level security;

create policy "shopping_checks read" on shopping_checks for select
  using (household_id = current_household_id());
create policy "shopping_checks insert" on shopping_checks for insert
  with check (household_id = current_household_id());
create policy "shopping_checks delete" on shopping_checks for delete
  using (household_id = current_household_id());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0005_pantry_shopping.sql
git commit -m "feat: pantry_items + shopping_checks tables with RLS"
```

---

## Task 2: Types + pantry matching utility (`src/lib/pantry.ts`)

**Files:** Create `src/lib/pantry.ts`.

- [ ] **Step 1: Write types and matching utility**

```ts
export const PANTRY_STATUSES = ['good', 'low', 'out'] as const
export type PantryStatus = (typeof PANTRY_STATUSES)[number]

export const PANTRY_STATUS_LABELS: Record<PantryStatus, string> = {
  good: 'Good',
  low: 'Low',
  out: 'Out',
}

export function nextStatus(current: PantryStatus): PantryStatus {
  const idx = PANTRY_STATUSES.indexOf(current)
  return PANTRY_STATUSES[(idx + 1) % PANTRY_STATUSES.length]
}

export interface PantryItem {
  id: string
  household_id: string
  name: string
  status: PantryStatus
  created_at: string
}

export interface ShoppingCheck {
  id: string
  household_id: string
  item: string
  week_start: string
}

export interface ShoppingRow {
  recipeId: string
  recipeName: string
  amount: string
  item: string
  itemKey: string
  inPantry: boolean
  checked: boolean
}

export function pantryMatchesIngredient(pantryName: string, ingredientItem: string): boolean {
  const p = pantryName.toLowerCase().trim()
  const i = ingredientItem.toLowerCase().trim()
  return p.length > 0 && i.length > 0 && (i.includes(p) || p.includes(i))
}

export function buildShoppingRows(
  recipes: { id: string; name: string; ingredients: { amount: string; item: string }[] }[],
  pantryItems: PantryItem[],
  checks: Set<string>,
): ShoppingRow[] {
  const goodPantry = pantryItems.filter((p) => p.status === 'good')
  const rows: ShoppingRow[] = []

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const itemKey = ing.item.toLowerCase().trim()
      const inPantry = goodPantry.some((p) => pantryMatchesIngredient(p.name, ing.item))
      const checked = checks.has(itemKey)
      rows.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        amount: ing.amount,
        item: ing.item,
        itemKey,
        inPantry,
        checked,
      })
    }
  }

  return rows.sort((a, b) => {
    const sectionA = a.inPantry ? 2 : a.checked ? 1 : 0
    const sectionB = b.inPantry ? 2 : b.checked ? 1 : 0
    if (sectionA !== sectionB) return sectionA - sectionB
    return a.item.localeCompare(b.item)
  })
}
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass with zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pantry.ts
git commit -m "feat: pantry types, status helpers, and shopping row builder"
```

---

## Task 3: Data layer (`src/lib/pantryData.ts`)

**Files:** Create `src/lib/pantryData.ts`.

- [ ] **Step 1: Write the data access module**

```ts
import { supabase } from './supabase'
import type { PantryItem, PantryStatus, ShoppingCheck } from './pantry'

export async function getPantryItems(householdId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('household_id', householdId)
    .order('name')
  if (error) throw error
  return (data ?? []) as PantryItem[]
}

export async function addPantryItem(householdId: string, name: string): Promise<PantryItem> {
  const { data, error } = await supabase
    .from('pantry_items')
    .insert({ household_id: householdId, name: name.trim(), status: 'good' })
    .select()
    .single()
  if (error) throw error
  return data as PantryItem
}

export async function updatePantryStatus(id: string, status: PantryStatus): Promise<void> {
  const { error } = await supabase
    .from('pantry_items')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

export async function bulkUpdatePantryStatus(ids: string[], status: PantryStatus): Promise<void> {
  const { error } = await supabase
    .from('pantry_items')
    .update({ status })
    .in('id', ids)
  if (error) throw error
}

export async function deletePantryItems(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('pantry_items')
    .delete()
    .in('id', ids)
  if (error) throw error
}

export async function getShoppingChecks(householdId: string, weekStart: string): Promise<ShoppingCheck[]> {
  const { data, error } = await supabase
    .from('shopping_checks')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
  if (error) throw error
  return (data ?? []) as ShoppingCheck[]
}

export async function toggleShoppingCheck(householdId: string, item: string, weekStart: string, isChecked: boolean): Promise<void> {
  if (isChecked) {
    const { error } = await supabase
      .from('shopping_checks')
      .delete()
      .eq('household_id', householdId)
      .eq('item', item)
      .eq('week_start', weekStart)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('shopping_checks')
      .insert({ household_id: householdId, item, week_start: weekStart })
    if (error) throw error
  }
}
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass with zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pantryData.ts
git commit -m "feat: data layer for pantry items and shopping checks"
```

---

## Task 4: Pantry list component with multi-select (`src/components/PantryList.tsx`)

**Files:** Create `src/components/PantryList.tsx`.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'
import type { PantryItem, PantryStatus } from '../lib/pantry'
import { PANTRY_STATUS_LABELS, PANTRY_STATUSES, nextStatus } from '../lib/pantry'
import { updatePantryStatus, bulkUpdatePantryStatus, deletePantryItems } from '../lib/pantryData'

const STATUS_COLORS: Record<PantryStatus, string> = {
  good: 'bg-brand text-white',
  low: 'bg-orange-400 text-white',
  out: 'bg-red-500 text-white',
}

interface PantryListProps {
  items: PantryItem[]
  onRefresh: () => void
}

export default function PantryList({ items, onRefresh }: PantryListProps) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map((i) => i.id)))
    }
  }

  function exitSelect() {
    setSelecting(false)
    setSelected(new Set())
  }

  async function handleCycleStatus(item: PantryItem) {
    try {
      await updatePantryStatus(item.id, nextStatus(item.status))
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  async function handleBulkStatus(status: PantryStatus) {
    if (selected.size === 0) return
    try {
      await bulkUpdatePantryStatus([...selected], status)
      exitSelect()
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    try {
      await deletePantryItems([...selected])
      exitSelect()
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-gray-400 text-4xl">🧺</p>
        <p className="text-gray-500">No pantry items yet. Add your staples below.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Select header */}
      <div className="flex items-center justify-between mb-3">
        {selecting ? (
          <>
            <button type="button" onClick={selectAll} className="text-sm text-brand font-semibold">
              {selected.size === items.length ? 'Deselect all' : 'Select all'}
            </button>
            <button type="button" onClick={exitSelect} className="text-sm text-gray-500 font-semibold">
              Done
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setSelecting(true)} className="text-sm text-brand font-semibold ml-auto">
            Select
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      {/* Item list */}
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selecting ? toggleSelect(item.id) : handleCycleStatus(item)}
            className="w-full flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-3 py-3 text-left"
          >
            {selecting && (
              <span className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
                selected.has(item.id) ? 'border-brand bg-brand text-white' : 'border-gray-300'
              }`}>
                {selected.has(item.id) ? '✓' : ''}
              </span>
            )}
            <span className="flex-1 font-semibold text-gray-900 truncate">{item.name}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}>
              {PANTRY_STATUS_LABELS[item.status]}
            </span>
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selecting && selected.size > 0 && (
        <div className="fixed bottom-20 inset-x-0 px-4 pb-3">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3 flex gap-2">
            {PANTRY_STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => handleBulkStatus(s)}
                className={`flex-1 text-xs font-bold py-2 rounded-lg ${STATUS_COLORS[s]}`}>
                {PANTRY_STATUS_LABELS[s]}
              </button>
            ))}
            <button type="button" onClick={handleBulkDelete}
              className="flex-1 text-xs font-bold py-2 rounded-lg bg-gray-100 text-red-600">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/PantryList.tsx
git commit -m "feat: PantryList component with status cycling and multi-select"
```

---

## Task 5: Pantry screen (`src/routes/Pantry.tsx`)

**Files:** Rewrite `src/routes/Pantry.tsx`.

- [ ] **Step 1: Rewrite the Pantry route**

```tsx
import { useEffect, useState, useCallback } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import type { PantryItem } from '../lib/pantry'
import { getPantryItems, addPantryItem } from '../lib/pantryData'
import PantryList from '../components/PantryList'

type PantryFilter = 'all' | 'low'

export default function Pantry() {
  const { householdId } = useHousehold()
  const [items, setItems] = useState<PantryItem[]>([])
  const [filter, setFilter] = useState<PantryFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    try {
      const data = await getPantryItems(householdId)
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [householdId])

  useEffect(() => { void load() }, [load])

  const filtered = filter === 'low'
    ? items.filter((i) => i.status === 'low' || i.status === 'out')
    : items

  async function handleAdd() {
    if (!householdId || !newName.trim()) return
    setAdding(true)
    setError(null)
    try {
      await addPantryItem(householdId, newName)
      setNewName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-32">
      <h1 className="text-2xl font-bold text-brand">Pantry</h1>

      {/* Filter toggle */}
      <div className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['all', 'All'],
          ['low', 'Running low'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button"
            onClick={() => setFilter(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              filter === value ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <p className="text-gray-500 text-center">Loading...</p>
        ) : (
          <PantryList items={filtered} onRefresh={load} />
        )}
      </div>

      {/* Add item bar */}
      <div className="fixed bottom-20 inset-x-0 px-4 pb-3">
        <form onSubmit={(e) => { e.preventDefault(); void handleAdd() }}
          className="flex gap-2 bg-white rounded-xl shadow-lg border border-gray-200 p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add pantry item..."
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-brand"
          />
          <button type="submit" disabled={!newName.trim() || adding}
            className="bg-brand text-white font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            Add
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Pantry.tsx
git commit -m "feat: Pantry screen with filter, add item, and multi-select"
```

---

## Task 6: Shopping list component (`src/components/ShoppingList.tsx`)

**Files:** Create `src/components/ShoppingList.tsx`.

- [ ] **Step 1: Create the component**

```tsx
import type { ShoppingRow } from '../lib/pantry'

interface ShoppingListProps {
  rows: ShoppingRow[]
  onToggle: (itemKey: string, currentlyChecked: boolean) => void
}

export default function ShoppingList({ rows, onToggle }: ShoppingListProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-gray-400 text-4xl">🛒</p>
        <p className="text-gray-500">No ingredients to show.</p>
        <p className="text-sm text-gray-400">Add recipes to your weekly pool first.</p>
      </div>
    )
  }

  const toBuy = rows.filter((r) => !r.checked && !r.inPantry)
  const checked = rows.filter((r) => r.checked && !r.inPantry)
  const inPantry = rows.filter((r) => r.inPantry)

  return (
    <div className="space-y-4">
      {/* To buy */}
      {toBuy.length > 0 && (
        <Section label="To buy">
          {toBuy.map((row, i) => (
            <ItemRow key={`${row.recipeId}-${row.item}-${i}`} row={row} onToggle={onToggle} />
          ))}
        </Section>
      )}

      {/* Checked off */}
      {checked.length > 0 && (
        <Section label="Purchased">
          {checked.map((row, i) => (
            <ItemRow key={`${row.recipeId}-${row.item}-${i}`} row={row} onToggle={onToggle} />
          ))}
        </Section>
      )}

      {/* In pantry */}
      {inPantry.length > 0 && (
        <Section label="In pantry">
          {inPantry.map((row, i) => (
            <div key={`${row.recipeId}-${row.item}-${i}`}
              className="flex items-center gap-3 px-3 py-2 opacity-40">
              <span className="w-5 h-5 rounded border-2 border-gray-200 flex items-center justify-center text-xs text-brand">✓</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500">
                  {row.amount && <span>{row.amount} </span>}{row.item}
                </p>
                <p className="text-[10px] text-gray-400">{row.recipeName}</p>
              </div>
              <span className="text-[10px] text-brand font-semibold">In pantry</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">{label}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ItemRow({ row, onToggle }: { row: ShoppingRow; onToggle: (itemKey: string, checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(row.itemKey, row.checked)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50"
    >
      <span className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
        row.checked ? 'border-brand bg-brand text-white' : 'border-gray-300'
      }`}>
        {row.checked ? '✓' : ''}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${row.checked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {row.amount && <span className="text-gray-500">{row.amount} </span>}{row.item}
        </p>
        <p className="text-[10px] text-gray-400">{row.recipeName}</p>
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ShoppingList.tsx
git commit -m "feat: ShoppingList component with sections and check-off"
```

---

## Task 7: Shopping screen (`src/routes/Shop.tsx`)

**Files:** Rewrite `src/routes/Shop.tsx`.

- [ ] **Step 1: Rewrite the Shop route**

```tsx
import { useEffect, useState, useCallback } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import { weekStartDate, tomorrowDate } from '../lib/mealPlan'
import type { PoolEntry, DailyPick } from '../lib/mealPlan'
import { getFullPool, getPicksForDate } from '../lib/mealPlans'
import type { PantryItem, ShoppingRow } from '../lib/pantry'
import { buildShoppingRows } from '../lib/pantry'
import { getPantryItems, getShoppingChecks, toggleShoppingCheck } from '../lib/pantryData'
import ShoppingList from '../components/ShoppingList'

type ShopMode = 'week' | 'tomorrow'

export default function Shop() {
  const { householdId } = useHousehold()
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
      const [pantryItems, checks, recipes] = await Promise.all([
        getPantryItems(householdId),
        getShoppingChecks(householdId, week),
        mode === 'week'
          ? getFullPool(householdId, week).then((entries: PoolEntry[]) =>
              entries.map((e) => e.recipe))
          : getPicksForDate(householdId, tomorrow).then((picks: DailyPick[]) =>
              picks.map((p) => p.recipe)),
      ])
      const checkSet = new Set(checks.map((c) => c.item))
      const uniqueRecipes = dedupeRecipes(recipes)
      setRows(buildShoppingRows(uniqueRecipes, pantryItems as PantryItem[], checkSet))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [householdId, mode, week, tomorrow])

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
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand">Shop</h1>
        {totalCount > 0 && (
          <p className="text-sm text-gray-500">
            <span className="font-bold text-gray-700">{toBuyCount}</span> of {totalCount} remaining
          </p>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['week', 'This Week'],
          ['tomorrow', 'Just Tomorrow'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button"
            onClick={() => setMode(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              mode === value ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <p className="text-gray-500 text-center">Loading...</p>
        ) : (
          <ShoppingList rows={rows} onToggle={handleToggle} />
        )}
      </div>
    </div>
  )
}

function dedupeRecipes(recipes: { id: string; name: string; ingredients: { amount: string; item: string }[] }[]) {
  const seen = new Set<string>()
  return recipes.filter((r) => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
}
```

- [ ] **Step 2: Verify** — Run `npx tsc -b`. Should pass.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Shop.tsx
git commit -m "feat: Shop screen with week/tomorrow toggle and pantry matching"
```

---

## Post-Implementation Checklist

After all tasks are complete:

1. **Apply migration:** Paste `supabase/migrations/0005_pantry_shopping.sql` into the Supabase dashboard SQL Editor and run.

2. **Manual E2E test flow:**
   - Go to Pantry → verify empty state → add several items (eggs, milk, rice, chicken)
   - Tap items to cycle status (Good → Low → Out → Good)
   - Tap "Select" → select multiple → bulk update to "Low" → verify badges update
   - Bulk delete an item → verify it's removed
   - Filter toggle: "Running low" shows only Low/Out items; "All" shows everything
   - Go to Plan → add recipes to pool (need recipes with ingredients)
   - Go to Shop → "This Week" → verify ingredients appear from pool recipes
   - Verify pantry items with status "Good" appear greyed at bottom with "In pantry" badge
   - Tap items to check off → verify they move to "Purchased" section with strikethrough
   - Toggle to "Just Tomorrow" → verify it shows only tomorrow's pick ingredients
   - Add a pantry item that matches an ingredient → verify it appears as "In pantry" on Shop

3. **Verify type-check:** `npx tsc -b` passes cleanly.

4. **Merge:** Once verified, merge `feat/pantry-shopping` into `main`.
