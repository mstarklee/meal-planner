# Main vs. Staple Ingredients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users record every recipe ingredient but flag each as **Main** or **Staple (Always have at home)**, so only Main ingredients reach the Shop list.

**Architecture:** A household-level `household_staples` list (seeded at household creation, grows as users mark staples) drives a smart default per ingredient. Each recipe ingredient stores its own optional `staple` boolean — the source of truth once saved, with a read-time staples-list fallback for legacy rows. Shop filters out staples entirely.

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres + RLS), Zod, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-20-main-vs-staple-ingredients-design.md`

---

## File Structure

- **Create** `supabase/migrations/0008_household_staples.sql` — new table, RLS, and `create or replace` of the onboarding function to seed default staples.
- **Create** `src/lib/staples.ts` — `Staple` type + data access (`getStaples`, `addStaple`, `removeStaple`). Mirrors `pantryData.ts`.
- **Modify** `src/lib/recipe.ts` — ingredient schema gains optional `staple`.
- **Modify** `src/lib/recipeNormalize.ts` — coerce `staple` to an explicit boolean on save.
- **Modify** `src/lib/recipeDraft.ts` — `draftToRecipeInput` carries `staple` through.
- **Modify** `src/lib/pantry.ts` — add `isStapleItem` matcher; `buildShoppingRows` filters staples.
- **Modify** `src/routes/Shop.tsx` — load staples list, pass names into `buildShoppingRows`.
- **Modify** `src/routes/RecipeForm.tsx` — per-row Main/Staple toggle, list-driven default, grow-list on save.
- **Modify** `src/routes/Settings.tsx` — "Pantry staples" editor section.
- **Create/Modify tests:** `src/lib/pantry.test.ts` (new), `src/lib/recipe.test.ts`, `src/lib/recipeNormalize.test.ts`.

**Key type decision:** `staple` is **optional** on the ingredient schema (`z.boolean().optional()`). This keeps all existing fixtures/literals compiling and matches the "legacy row = unknown flag" reality. `normalizeRecipeInput` coerces it to an explicit boolean on save, so newly saved recipes always carry a real flag; only pre-existing DB rows have `undefined`, handled by the Shop fallback.

---

## Task 1: Database migration — `household_staples` table + seed

**Files:**
- Create: `supabase/migrations/0008_household_staples.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_household_staples.sql` with this exact content:

```sql
-- Household staples: "always available at home" ingredients that never enter the Shop list.
create table household_staples (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index household_staples_household_name_idx on household_staples (household_id, lower(name));
create index household_staples_household_idx on household_staples (household_id);

alter table household_staples enable row level security;

create policy "household_staples read" on household_staples for select
  using (household_id = current_household_id());
create policy "household_staples insert" on household_staples for insert
  with check (household_id = current_household_id());
create policy "household_staples delete" on household_staples for delete
  using (household_id = current_household_id());

-- Extend onboarding to seed a default staples set for new households.
create or replace function create_household_with_setup(
  p_name text,
  p_display_name text,
  p_kids text[],
  p_calories int,
  p_protein int,
  p_fiber int,
  p_evening time,
  p_morning time
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_kid text;
  v_staple text;
  v_default_staples text[] := array[
    'salt', 'sugar', 'oil', 'ghee', 'cumin', 'mustard seeds', 'turmeric',
    'chili powder', 'coriander powder', 'garam masala', 'ginger-garlic paste',
    'black pepper', 'water'
  ];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into households (name, created_by) values (p_name, auth.uid())
    returning id into v_household_id;

  update profiles set household_id = v_household_id, display_name = p_display_name
    where id = auth.uid();
  if not found then
    raise exception 'profile row missing for current user';
  end if;

  insert into household_settings
    (household_id, target_calories, target_protein, target_fiber, evening_reminder_time, morning_reminder_time)
    values (v_household_id, p_calories, p_protein, p_fiber, p_evening, p_morning);

  if p_kids is not null then
    foreach v_kid in array p_kids loop
      if length(trim(v_kid)) > 0 then
        insert into kids (household_id, name) values (v_household_id, v_kid);
      end if;
    end loop;
  end if;

  foreach v_staple in array v_default_staples loop
    insert into household_staples (household_id, name) values (v_household_id, v_staple)
      on conflict do nothing;
  end loop;

  return v_household_id;
end;
$$;

grant execute on function create_household_with_setup(text, text, text[], int, int, int, time, time) to authenticated;
```

- [ ] **Step 2: Verify SQL parses (lint-only, no live DB required)**

Run: `git diff --stat` and visually confirm the file exists. (This project applies migrations against Supabase out-of-band; there is no local migration runner in the repo. Do not attempt to apply it.)
Expected: the new file is listed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_household_staples.sql
git commit -m "feat: household_staples table, RLS, and onboarding seed"
```

---

## Task 2: Staples data-access library

**Files:**
- Create: `src/lib/staples.ts`

This mirrors `src/lib/pantryData.ts` (which has no unit tests — it's a thin Supabase wrapper), so there is no separate test file for it. The pure matching logic lives in `pantry.ts` and is tested in Task 4.

- [ ] **Step 1: Write `src/lib/staples.ts`**

```ts
import { supabase } from './supabase'

export interface Staple {
  id: string
  household_id: string
  name: string
  created_at: string
}

export async function getStaples(householdId: string): Promise<Staple[]> {
  const { data, error } = await supabase
    .from('household_staples')
    .select('*')
    .eq('household_id', householdId)
    .order('name')
  if (error) throw error
  return (data ?? []) as Staple[]
}

export async function addStaple(householdId: string, name: string): Promise<Staple> {
  const { data, error } = await supabase
    .from('household_staples')
    .insert({ household_id: householdId, name: name.trim() })
    .select()
    .single()
  if (error) throw error
  return data as Staple
}

export async function removeStaple(id: string): Promise<void> {
  const { error } = await supabase
    .from('household_staples')
    .delete()
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/staples.ts
git commit -m "feat: household staples data-access lib"
```

---

## Task 3: Ingredient `staple` flag — schema, normalize, draft

**Files:**
- Modify: `src/lib/recipe.ts:20`
- Modify: `src/lib/recipeNormalize.ts:7-9`
- Modify: `src/lib/recipeDraft.ts:15,33`
- Test: `src/lib/recipe.test.ts`, `src/lib/recipeNormalize.test.ts`

- [ ] **Step 1: Add failing schema test**

In `src/lib/recipe.test.ts`, add inside the `describe('recipeSchema', ...)` block:

```ts
  it('retains the staple flag on parse', () => {
    const parsed = recipeSchema.parse({
      ...valid,
      ingredients: [{ amount: '1 tsp', item: 'salt', staple: true }],
    })
    expect(parsed.ingredients[0].staple).toBe(true)
  })
  it('accepts a legacy ingredient with no staple flag', () => {
    const parsed = recipeSchema.parse({
      ...valid,
      ingredients: [{ amount: '1 tsp', item: 'salt' }],
    })
    expect(parsed.ingredients[0].staple).toBeUndefined()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/recipe.test.ts`
Expected: FAIL on `retains the staple flag on parse` — Zod's ingredient object currently has no `staple` key, so it strips the field and `parsed.ingredients[0].staple` is `undefined`.

- [ ] **Step 3: Add `staple` to the ingredient schema**

In `src/lib/recipe.ts`, change the `ingredients` line (currently line 20):

```ts
  ingredients: z.array(z.object({
    amount: z.string(),
    item: z.string().trim().min(1, 'Ingredient required'),
    staple: z.boolean().optional(),
  })),
```

- [ ] **Step 4: Run the schema tests**

Run: `npx vitest run src/lib/recipe.test.ts`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 5: Add failing normalize test**

In `src/lib/recipeNormalize.test.ts`, add a new test inside the `describe`:

```ts
  it('coerces staple to an explicit boolean and preserves true', () => {
    const out = normalizeRecipeInput({
      name: 'Paneer',
      photo_url: '', link_url: '',
      meal_types: ['dinner'], tags: [],
      calories: null, protein: null, fiber: null, nutrition_estimated: false,
      ingredients: [
        { amount: '200g', item: 'paneer', staple: false },
        { amount: '1 tsp', item: 'salt', staple: true },
        { amount: '1', item: 'onion' },
      ],
      steps: ['Cook'],
      is_shared: false,
    })
    expect(out.ingredients).toEqual([
      { amount: '200g', item: 'paneer', staple: false },
      { amount: '1 tsp', item: 'salt', staple: true },
      { amount: '1', item: 'onion', staple: false },
    ])
  })
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/recipeNormalize.test.ts`
Expected: FAIL — output ingredients lack the `staple` key.

- [ ] **Step 7: Update `normalizeRecipeInput`**

In `src/lib/recipeNormalize.ts`, change the `ingredients` mapping:

```ts
    ingredients: input.ingredients
      .map((i) => ({ amount: i.amount.trim(), item: i.item.trim(), staple: Boolean(i.staple) }))
      .filter((i) => i.item.length > 0),
```

- [ ] **Step 8: Run normalize tests**

Run: `npx vitest run src/lib/recipeNormalize.test.ts`
Expected: PASS. (The pre-existing test expects `[{ amount: '1 cup', item: 'lentils' }]` — update its expectation to include `staple: false`.)

Update that existing assertion to:

```ts
    expect(out.ingredients).toEqual([{ amount: '1 cup', item: 'lentils', staple: false }])
```

- [ ] **Step 9: Carry `staple` through AI-import drafts**

In `src/lib/recipeDraft.ts`, update the ingredients schema (line ~15):

```ts
  ingredients: z.array(z.object({
    amount: z.string().default(''),
    item: z.string(),
    staple: z.boolean().optional(),
  })).default([]),
```

and the mapping in `draftToRecipeInput` (line ~33):

```ts
    ingredients: draft.ingredients.map((i) => ({ amount: i.amount, item: i.item, staple: i.staple })),
```

- [ ] **Step 10: Full type-check + test run**

Run: `npx tsc --noEmit && npx vitest run src/lib/recipe.test.ts src/lib/recipeNormalize.test.ts`
Expected: no type errors; all tests PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/recipe.ts src/lib/recipeNormalize.ts src/lib/recipeDraft.ts src/lib/recipe.test.ts src/lib/recipeNormalize.test.ts
git commit -m "feat: add optional staple flag to recipe ingredients"
```

---

## Task 4: Shop filtering — `isStapleItem` + `buildShoppingRows`

**Files:**
- Modify: `src/lib/pantry.ts`
- Test: `src/lib/pantry.test.ts` (create)

- [ ] **Step 1: Write failing tests**

Create `src/lib/pantry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isStapleItem, buildShoppingRows } from './pantry'
import type { PantryItem } from './pantry'

const noPantry: PantryItem[] = []
const noChecks = new Set<string>()

describe('isStapleItem', () => {
  it('matches case-insensitively and bidirectionally', () => {
    expect(isStapleItem('Salt', ['salt'])).toBe(true)
    expect(isStapleItem('table salt', ['salt'])).toBe(true)
    expect(isStapleItem('paneer', ['salt', 'sugar'])).toBe(false)
  })
  it('returns false for empty inputs', () => {
    expect(isStapleItem('', ['salt'])).toBe(false)
    expect(isStapleItem('salt', [])).toBe(false)
  })
})

describe('buildShoppingRows staple filtering', () => {
  const recipe = (ingredients: { amount: string; item: string; staple?: boolean }[]) =>
    [{ id: 'r1', name: 'Dish', ingredients }]

  it('hides ingredients explicitly flagged staple', () => {
    const rows = buildShoppingRows(
      recipe([{ amount: '200g', item: 'paneer', staple: false }, { amount: '1 tsp', item: 'salt', staple: true }]),
      noPantry, noChecks, ['salt'],
    )
    expect(rows.map((r) => r.item)).toEqual(['paneer'])
  })

  it('hides legacy ingredients (no flag) that match the staples list', () => {
    const rows = buildShoppingRows(
      recipe([{ amount: '200g', item: 'paneer' }, { amount: '1 tsp', item: 'cumin' }]),
      noPantry, noChecks, ['cumin'],
    )
    expect(rows.map((r) => r.item)).toEqual(['paneer'])
  })

  it('keeps a main ingredient even if it appears in the staples list when explicitly flagged main', () => {
    const rows = buildShoppingRows(
      recipe([{ amount: '2', item: 'egg', staple: false }]),
      noPantry, noChecks, ['egg'],
    )
    expect(rows.map((r) => r.item)).toEqual(['egg'])
  })

  it('still applies pantry "good" matching to main ingredients', () => {
    const pantry: PantryItem[] = [
      { id: 'p1', household_id: 'h', name: 'paneer', status: 'good', created_at: '' },
    ]
    const rows = buildShoppingRows(
      recipe([{ amount: '200g', item: 'paneer', staple: false }]),
      pantry, noChecks, [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].inPantry).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/pantry.test.ts`
Expected: FAIL — `isStapleItem` is not exported; `buildShoppingRows` takes only 3 args.

- [ ] **Step 3: Add `isStapleItem` and update `buildShoppingRows`**

In `src/lib/pantry.ts`, after `pantryMatchesIngredient` add:

```ts
export function isStapleItem(ingredientItem: string, stapleNames: string[]): boolean {
  return stapleNames.some((name) => pantryMatchesIngredient(name, ingredientItem))
}
```

Change the `buildShoppingRows` signature and ingredient loop. New signature and body:

```ts
export function buildShoppingRows(
  recipes: { id: string; name: string; ingredients: { amount: string; item: string; staple?: boolean }[] }[],
  pantryItems: PantryItem[],
  checks: Set<string>,
  stapleNames: string[],
): ShoppingRow[] {
  const goodPantry = pantryItems.filter((p) => p.status === 'good')
  const rows: ShoppingRow[] = []

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const isStaple = ing.staple === true || (ing.staple == null && isStapleItem(ing.item, stapleNames))
      if (isStaple) { continue }
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

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/pantry.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pantry.ts src/lib/pantry.test.ts
git commit -m "feat: filter staple ingredients out of the shopping list"
```

---

## Task 5: Wire staples into the Shop screen

**Files:**
- Modify: `src/routes/Shop.tsx:6-8,28-39`

- [ ] **Step 1: Import staples data access**

In `src/routes/Shop.tsx`, add after the `pantryData` import (line 8):

```ts
import { getStaples } from '../lib/staples'
```

- [ ] **Step 2: Load staples and pass into `buildShoppingRows`**

Replace the `Promise.all` block and the `buildShoppingRows` call inside `load` (lines 28-39) with:

```ts
      const [pantryItems, checks, staples, recipes] = await Promise.all([
        getPantryItems(householdId),
        getShoppingChecks(householdId, week),
        getStaples(householdId),
        mode === 'week'
          ? getFullPool(householdId, week).then((entries: PoolEntry[]) =>
              entries.map((e) => e.recipe))
          : getPicksForDate(householdId, tomorrow).then((picks: DailyPick[]) =>
              picks.map((p) => p.recipe)),
      ])
      const checkSet = new Set(checks.map((c) => c.item))
      const uniqueRecipes = dedupeRecipes(recipes)
      setRows(buildShoppingRows(uniqueRecipes, pantryItems as PantryItem[], checkSet, staples.map((s) => s.name)))
```

- [ ] **Step 3: Type-check + run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Shop.tsx
git commit -m "feat: Shop loads household staples and excludes them"
```

---

## Task 6: Recipe form — Main/Staple toggle, default, grow-list

**Files:**
- Modify: `src/routes/RecipeForm.tsx`

- [ ] **Step 1: Imports and staples state**

In `src/routes/RecipeForm.tsx`, add imports near the top (after line 8):

```ts
import { getStaples, addStaple } from '../lib/staples'
import { isStapleItem } from '../lib/pantry'
```

Extend the `IngredientRow` interface (currently lines 11-15):

```ts
interface IngredientRow {
  id: string
  amount: string
  item: string
  staple: boolean
  stapleTouched: boolean
}
```

Add staples state after the other `useState` declarations (near line 50):

```ts
  const [stapleNames, setStapleNames] = useState<string[]>([])
```

- [ ] **Step 2: Load staples on mount**

Add a new effect after the existing recipe-loading effect (after line 80):

```ts
  useEffect(() => {
    if (!householdId) { return }
    let active = true
    void getStaples(householdId).then((s) => { if (active) { setStapleNames(s.map((x) => x.name)) } })
    return () => { active = false }
  }, [householdId])
```

- [ ] **Step 3: Update ingredient initializers to include the new fields**

The draft initializer (line 45-47) becomes:

```ts
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    () => (draft?.ingredients ?? []).map((i) => ({
      id: crypto.randomUUID(), amount: i.amount, item: i.item,
      staple: i.staple ?? false, stapleTouched: i.staple != null,
    })),
  )
```

The edit-load initializer (line 68) becomes:

```ts
        setIngredients(recipe.ingredients.map((i) => ({
          id: crypto.randomUUID(), amount: i.amount, item: i.item,
          staple: i.staple ?? false, stapleTouched: i.staple != null,
        })))
```

- [ ] **Step 4: Update ingredient mutators for list-driven default and explicit toggle**

Replace `addIngredient` / `setIngredient` / `removeIngredient` (lines 82-90) with:

```ts
  function addIngredient() {
    setIngredients([...ingredients, { id: crypto.randomUUID(), amount: '', item: '', staple: false, stapleTouched: false }])
  }
  function setIngredient(i: number, patch: Partial<Pick<IngredientRow, 'amount' | 'item'>>) {
    setIngredients(ingredients.map((row, idx) => {
      if (idx !== i) { return row }
      const next = { ...row, ...patch }
      // Until the user manually toggles, keep the staple default in sync with the item name.
      if (!next.stapleTouched && patch.item !== undefined) {
        next.staple = isStapleItem(patch.item, stapleNames)
      }
      return next
    }))
  }
  function toggleStaple(i: number) {
    setIngredients(ingredients.map((row, idx) =>
      idx === i ? { ...row, staple: !row.staple, stapleTouched: true } : row))
  }
  function removeIngredient(i: number) {
    setIngredients(ingredients.filter((_, idx) => idx !== i))
  }
```

- [ ] **Step 5: Send `staple` to the input and grow the staples list on save**

In `submit` (lines 110-133), update the ingredients mapping in `input`:

```ts
      ingredients: ingredients.map((row) => ({ amount: row.amount, item: row.item, staple: row.staple })),
```

and after a successful `createRecipe`/`updateRecipe` (right after the `saved` assignment, before `nav(...)`), add the grow-list side effect:

```ts
      // Best-effort: learn newly-marked staples for future recipes. Never block the save.
      const known = new Set(stapleNames.map((n) => n.toLowerCase()))
      const newStaples = normalized.ingredients
        .filter((ing) => ing.staple && ing.item && !known.has(ing.item.toLowerCase()))
        .map((ing) => ing.item)
      await Promise.all(newStaples.map((name) =>
        addStaple(householdId as string, name).catch(() => undefined)))
```

- [ ] **Step 6: Render the toggle per ingredient row**

Replace the ingredient row block (lines 191-202) — wrap each row so the toggle sits under the amount/item inputs:

```tsx
            {ingredients.map((row, i) => (
              <div key={row.id} className="space-y-1">
                <div className="flex gap-2">
                  <input className="w-24 border rounded-xl p-3" aria-label={`Ingredient ${i + 1} amount`}
                    value={row.amount} onChange={(e) => setIngredient(i, { amount: e.target.value })}
                    placeholder="1 cup" />
                  <input className="flex-1 border rounded-xl p-3" aria-label={`Ingredient ${i + 1} item`}
                    value={row.item} onChange={(e) => setIngredient(i, { item: e.target.value })}
                    placeholder="rice" />
                  <button type="button" aria-label={`Remove ingredient ${i + 1}`}
                    className="px-3 text-red-500" onClick={() => removeIngredient(i)}>✕</button>
                </div>
                <div className="flex gap-1 ml-1" role="group" aria-label={`Ingredient ${i + 1} type`}>
                  <button type="button"
                    aria-pressed={!row.staple}
                    onClick={() => { if (row.staple) { toggleStaple(i) } }}
                    className={`text-xs font-semibold rounded-full px-3 py-1 ${
                      !row.staple ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'}`}>
                    Main
                  </button>
                  <button type="button"
                    aria-pressed={row.staple}
                    onClick={() => { if (!row.staple) { toggleStaple(i) } }}
                    className={`text-xs font-semibold rounded-full px-3 py-1 ${
                      row.staple ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'}`}>
                    Staple (Always have at home)
                  </button>
                </div>
              </div>
            ))}
```

- [ ] **Step 7: Type-check + run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS. If `RecipeForm.test.tsx` constructs ingredient fixtures that now need to compile, it should still pass since `staple` is optional. Fix any fixture only if TypeScript reports an error.

- [ ] **Step 8: Commit**

```bash
git add src/routes/RecipeForm.tsx
git commit -m "feat: Main/Staple toggle in recipe form with list-driven default"
```

---

## Task 7: Settings — Pantry staples editor

**Files:**
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Imports and state**

In `src/routes/Settings.tsx`, add after line 7:

```ts
import { getStaples, addStaple, removeStaple, type Staple } from '../lib/staples'
```

Add state after the push state (near line 29):

```ts
  const [staples, setStaples] = useState<Staple[]>([])
  const [newStaple, setNewStaple] = useState('')
  const [stapleError, setStapleError] = useState<string | null>(null)
```

- [ ] **Step 2: Load staples**

Add an effect after the existing `getPushState` effect (line 31):

```ts
  useEffect(() => {
    if (!householdId) return
    void getStaples(householdId).then(setStaples).catch(() => undefined)
  }, [householdId])
```

- [ ] **Step 3: Add/remove handlers**

Add after `handleEnablePush` (near line 60):

```ts
  async function handleAddStaple() {
    const name = newStaple.trim()
    if (!householdId || !name) return
    setStapleError(null)
    if (staples.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setStapleError('Already in your staples'); return
    }
    try {
      const created = await addStaple(householdId, name)
      setStaples([...staples, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewStaple('')
    } catch (e) {
      setStapleError(e instanceof Error ? e.message : 'Could not add')
    }
  }

  async function handleRemoveStaple(id: string) {
    try {
      await removeStaple(id)
      setStaples(staples.filter((s) => s.id !== id))
    } catch (e) {
      setStapleError(e instanceof Error ? e.message : 'Could not remove')
    }
  }
```

- [ ] **Step 4: Render the staples section**

Add a new `<section>` just before the Account section (before line 119, the `{/* Account */}` comment):

```tsx
      {/* Pantry staples */}
      <section className="space-y-2 pt-2 border-t border-gray-100">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Pantry staples</h2>
        <p className="text-sm text-gray-500">
          Always-available items. These never show up in your shopping list.
        </p>
        <div className="flex flex-wrap gap-1">
          {staples.map((s) => (
            <span key={s.id}
              className="text-xs px-2 py-1 rounded-full bg-brand-soft text-gray-700 flex items-center gap-1">
              {s.name}
              <button type="button" aria-label={`Remove ${s.name}`}
                onClick={() => handleRemoveStaple(s.id)} className="text-gray-400">✕</button>
            </span>
          ))}
          {staples.length === 0 && <span className="text-sm text-gray-400">No staples yet.</span>}
        </div>
        <div className="flex gap-2">
          <input value={newStaple} onChange={(e) => setNewStaple(e.target.value)}
            aria-label="New staple" placeholder="e.g. salt"
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm" />
          <button type="button" onClick={handleAddStaple}
            className="bg-brand text-white font-bold rounded-lg px-3 py-1 text-sm">Add</button>
        </div>
        {stapleError && <p className="text-red-600 text-sm">{stapleError}</p>}
      </section>
```

- [ ] **Step 5: Type-check + run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Settings.tsx
git commit -m "feat: pantry staples editor in Settings"
```

---

## Task 8: End-to-end verification in the browser

**Files:** none (manual verification via the preview tools)

- [ ] **Step 1: Start the dev server and confirm it builds**

Use the preview tooling to start the dev server. Confirm no console/build errors.

- [ ] **Step 2: Verify the recipe form**

Open the new-recipe form. Add an ingredient named `salt` — confirm the toggle auto-selects **Staple**. Add `paneer` — confirm it stays **Main**. Confirm you can manually flip either. Save the recipe.

- [ ] **Step 3: Verify Shop excludes staples**

Plan that recipe (or use the pool), open Shop, and confirm `salt` does **not** appear while `paneer` does.

- [ ] **Step 4: Verify Settings**

Open Settings → Pantry staples. Confirm the seeded defaults appear (for a freshly onboarded household), add a staple, remove one, and confirm the list updates.

- [ ] **Step 5: Screenshot proof**

Capture screenshots of the recipe-form toggle and the Shop list (staple absent) to share as proof.

---

## Self-Review Notes

- **Spec coverage:** table + seed (Task 1), staples lib (Task 2), ingredient flag + schema/normalize/draft (Task 3), Shop filtering with legacy fallback (Tasks 4–5), form toggle + default + grow (Task 6), Settings editor (Task 7), Pantry unchanged (no task needed). All spec sections mapped.
- **Type consistency:** `buildShoppingRows(recipes, pantryItems, checks, stapleNames)` — 4 args, used consistently in Task 4 (impl + tests) and Task 5 (Shop). `isStapleItem(item, stapleNames)` used in Tasks 4 and 6. `Staple` type used in Tasks 2, 7. `IngredientRow` gains `staple`/`stapleTouched` consistently across Task 6 steps.
- **Legacy fallback:** old recipe rows (no `staple`) handled by `ing.staple == null && isStapleItem(...)` in `buildShoppingRows`; verified explicitly in Task 4 tests.
