# Per-Person Recipes, Family-Count Scaling & Full Nutrition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every recipe's nutrition and ingredient amounts per one person, scale ingredient quantities by household family count, and expand nutrition to a 17-nutrient model shown with icons and "actual vs daily need" comparison (Adult/Kid) on the Recipe and Home pages.

**Architecture:** A canonical nutrient registry (`src/lib/nutrients.ts`) is the single source of truth for keys, units, icons, kid-friendly copy, and seed RDA targets. Recipe nutrition becomes a per-person `nutrients` JSON map; household settings gain `adults` plus editable `targets_adult`/`targets_kid` JSON maps. Pure libs (`scale.ts`, `nutrition.ts`) do amount scaling and rollup math; presentational components render `{values, targets}` pairs.

**Tech Stack:** React 19 + TS + Vite, Tailwind 3.4.x, Supabase (Postgres + RLS), Zod, Vitest, Node+Hono backend. Spec: `docs/superpowers/specs/2026-06-26-per-person-nutrition-scaling-design.md`.

**Conventions for this repo:** Per the user's standing preference, this is **direct implementation (not test-first)**: each task implements code, then adds unit tests for pure logic, then runs them. Typecheck is `npm run typecheck` (frontend, `tsc -b`) and `npm run typecheck:server`. Tests: `npm test`. Build: `npm run build`. Branch before starting: `git checkout -b feat/per-person-nutrition`.

---

## File Structure

**New files:**
- `src/lib/nutrients.ts` — nutrient registry (data only), `NutrientMap` type, seed targets.
- `src/lib/scale.ts` — `scaleAmount`, `countForSlot` (pure).
- `src/lib/nutrition.ts` — `sumNutrients`, `buildNutrientRows` (pure rollup/compare).
- `src/components/NutritionPanel.tsx` — full 17-nutrient panel for Recipe detail.
- `supabase/migrations/0009_per_person_nutrition.sql` — schema + RPC + data reset.
- Test files alongside: `src/lib/scale.test.ts`, `src/lib/nutrition.test.ts`, `src/lib/nutrients.test.ts`.

**Modified files:**
- `src/components/Icon.tsx` — add nutrient icons.
- `src/lib/recipe.ts` — `nutrients` map replaces `calories/protein/fiber`.
- `src/lib/recipeDraft.ts`, `src/lib/recipeNormalize.ts` — nutrients map.
- `src/lib/householdDefaults.ts` — settings shape (adults, target maps).
- `src/context/HouseholdProvider.tsx` — expose `adults`, `familyCount`, `kidCount`, `targetsAdult`, `targetsKid`.
- `src/lib/onboardingSchema.ts`, `src/routes/Onboarding.tsx` — adults input + RPC.
- `src/routes/Settings.tsx` — adults + editable Adult/Kid targets.
- `src/routes/RecipeForm.tsx` — 17-nutrient inputs + per-person helper.
- `src/routes/RecipeDetail.tsx` — render `NutritionPanel` + Serves stepper for ingredients.
- `src/components/NutritionStrip.tsx` — generalized to render nutrient rows.
- `src/routes/Today.tsx` — two rollups (You / Kid's day).
- `src/routes/Shop.tsx`, `src/lib/pantry.ts` — scale ingredient amounts per slot.
- `src/components/MealCard.tsx`, `src/components/RecipeCard.tsx` — headline nutrients.
- `server/src/prompt.ts` — per-person 17-nutrient extraction + ingredient normalization.

---

## Phase A — Nutrient foundation (pure libs)

### Task 1: Nutrient registry + icons

**Files:**
- Create: `src/lib/nutrients.ts`
- Create: `src/lib/nutrients.test.ts`
- Modify: `src/components/Icon.tsx`

- [ ] **Step 1: Create the registry**

Create `src/lib/nutrients.ts`:

```ts
import type { IconName } from '../components/Icon'

export type NutrientGroup = 'macro' | 'vitamin' | 'mineral'

export interface NutrientDef {
  key: string
  label: string
  unit: string // 'kcal' | 'g' | 'mg' | 'µg'
  group: NutrientGroup
  icon: IconName
  why: string
  adultRda: number
  kidRda: number
  headline?: boolean
}

// Single source of truth. Seed RDA values are standard dietary references
// (adult ~2000 kcal reference; kid = representative school-age 4-8). All editable in-app.
export const NUTRIENTS: NutrientDef[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', group: 'macro', icon: 'n-energy', why: 'Fuel for play & growth', adultRda: 2000, kidRda: 1400, headline: true },
  { key: 'protein', label: 'Protein', unit: 'g', group: 'macro', icon: 'n-protein', why: 'Builds muscles', adultRda: 90, kidRda: 19, headline: true },
  { key: 'carbs', label: 'Carbs', unit: 'g', group: 'macro', icon: 'n-carbs', why: 'Quick energy for the brain', adultRda: 275, kidRda: 130 },
  { key: 'healthy_fats', label: 'Healthy fats', unit: 'g', group: 'macro', icon: 'n-fats', why: 'Brain growth & vitamin uptake', adultRda: 70, kidRda: 50 },
  { key: 'fiber', label: 'Fiber', unit: 'g', group: 'macro', icon: 'n-fiber', why: 'Happy tummy & digestion', adultRda: 28, kidRda: 25, headline: true },
  { key: 'vitamin_a', label: 'Vitamin A', unit: 'µg', group: 'vitamin', icon: 'n-vit-a', why: 'Sharp eyesight', adultRda: 900, kidRda: 400 },
  { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg', group: 'vitamin', icon: 'n-vit-c', why: 'Immunity & healing', adultRda: 90, kidRda: 25 },
  { key: 'vitamin_d', label: 'Vitamin D', unit: 'µg', group: 'vitamin', icon: 'n-vit-d', why: 'Strong bones (with calcium)', adultRda: 20, kidRda: 15 },
  { key: 'folate', label: 'Folate', unit: 'µg', group: 'vitamin', icon: 'n-folate', why: 'Makes new cells (growth)', adultRda: 400, kidRda: 200 },
  { key: 'choline', label: 'Choline', unit: 'mg', group: 'vitamin', icon: 'n-choline', why: 'Memory & brain development', adultRda: 550, kidRda: 250 },
  { key: 'vitamin_b12', label: 'Vitamin B12', unit: 'µg', group: 'vitamin', icon: 'n-b12', why: 'Energy & healthy nerves', adultRda: 2.4, kidRda: 1.2 },
  { key: 'iron', label: 'Iron', unit: 'mg', group: 'mineral', icon: 'n-iron', why: 'Healthy blood & focus', adultRda: 18, kidRda: 10 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral', icon: 'n-calcium', why: 'Strong bones & teeth', adultRda: 1300, kidRda: 1000 },
  { key: 'potassium', label: 'Potassium', unit: 'mg', group: 'mineral', icon: 'n-potassium', why: 'Heart & muscles', adultRda: 4700, kidRda: 2300 },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'mineral', icon: 'n-zinc', why: 'Immunity & growth', adultRda: 11, kidRda: 5 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral', icon: 'n-magnesium', why: 'Muscles & calm sleep', adultRda: 420, kidRda: 130 },
  { key: 'omega_3', label: 'Omega-3', unit: 'g', group: 'mineral', icon: 'n-omega3', why: 'Brain & eye development', adultRda: 1.6, kidRda: 0.9 },
]

export type NutrientMap = Record<string, number | null>

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key)
export const HEADLINE_NUTRIENTS = NUTRIENTS.filter((n) => n.headline)
export const NUTRIENT_GROUPS: NutrientGroup[] = ['macro', 'vitamin', 'mineral']

export function nutrientsByGroup(group: NutrientGroup): NutrientDef[] {
  return NUTRIENTS.filter((n) => n.group === group)
}

export function emptyNutrientMap(): NutrientMap {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null]))
}

// Seed target maps used as defaults for new households and as Settings reset values.
export function seedTargets(kind: 'adult' | 'kid'): Record<string, number> {
  return Object.fromEntries(NUTRIENTS.map((n) => [n.key, kind === 'adult' ? n.adultRda : n.kidRda]))
}

export const GROUP_LABELS: Record<NutrientGroup, string> = {
  macro: 'Macros', vitamin: 'Vitamins', mineral: 'Minerals',
}
```

- [ ] **Step 2: Add nutrient icons to Icon.tsx**

In `src/components/Icon.tsx`, extend the `IconName` union (add after `'empty-plate'`):

```ts
  | 'n-energy' | 'n-protein' | 'n-carbs' | 'n-fats' | 'n-fiber'
  | 'n-vit-a' | 'n-vit-c' | 'n-vit-d' | 'n-folate' | 'n-choline' | 'n-b12'
  | 'n-iron' | 'n-calcium' | 'n-potassium' | 'n-zinc' | 'n-magnesium' | 'n-omega3'
```

Add these entries to the `paths` record (paths taken from the approved mockup):

```tsx
  'n-energy': <path d="M13 3 5 13h6l-2 8 9-11h-6z" />,
  'n-protein': <><path d="M6 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2M18 9a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2M6 11h2M16 11h2M8 10v4M16 10v4M8 12h8" /></>,
  'n-carbs': <path d="M12 3c0 4 0 14 0 18M12 6c-1.5-1.5-4-1.5-4-1.5s.5 3 2 4M12 6c1.5-1.5 4-1.5 4-1.5s-.5 3-2 4M12 12c-1.5-1.5-4-1.5-4-1.5s.5 3 2 4M12 12c1.5-1.5 4-1.5 4-1.5s-.5 3-2 4" />,
  'n-fats': <path d="M12 3c-4 4-6 7-6 10a6 6 0 0 0 12 0c0-3-2-6-6-10Z" />,
  'n-fiber': <path d="M11 20c-4 0-7-3-7-7 4 0 7 3 7 7ZM11 20c0-6 3-11 9-13-1 7-4 13-9 13Z" />,
  'n-vit-a': <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  'n-vit-c': <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" /></>,
  'n-vit-d': <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  'n-folate': <path d="M12 21c0-5 0-9 0-12M12 9C10 7 6 7 6 7s0 4 2 5 4 .5 4-3ZM12 12c2-2 6-2 6-2s0 4-2 5-4 .5-4-3Z" />,
  'n-choline': <><path d="M9 18c-3 0-5-2-5-5 0-2 1-3 1-5 0-2 2-4 4-4 1 0 2 .5 3 1 1-.5 2-1 3-1 2 0 4 2 4 4 0 2 1 3 1 5 0 3-2 5-5 5" /><path d="M9 18v2M15 18v2" /></>,
  'n-b12': <><path d="M7 4h8l-1 6 3 4v6H5v-6l3-4z" /><path d="M9 14h6" /></>,
  'n-iron': <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11Z" />,
  'n-calcium': <path d="M7 4c-1.5 0-2.5 1-2.5 2.5S6 9 7 9.5 8.5 11 7 11M17 4c1.5 0 2.5 1 2.5 2.5S18 9 17 9.5 15.5 11 17 11M7 13c-1.5 0-2.5 1-2.5 2.5S6 18 7 18.5M17 13c1.5 0 2.5 1 2.5 2.5S18 18 17 18.5M7 9.5h10M7 15.5h10" />,
  'n-potassium': <path d="M20 5c-1 6-5 11-10 13-2 .8-4 0-4-2 0-1 1-2 3-3 4-2 7-5 11-8Z" />,
  'n-zinc': <><path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z" /><path d="M9.5 12l1.8 1.8 3.2-3.6" /></>,
  'n-magnesium': <><path d="M4 18c2-1 3-3 3-6 0-2 1.5-4 5-4s5 2 5 4c0 3 1 5 3 6" /><path d="M9 8c0-1.5 1-3 3-3s3 1.5 3 3" /></>,
  'n-omega3': <><path d="M3 12c3-4 7-5 11-5 2 0 4 1 6 2-2 1-4 2-6 2-4 0-8-1-11 1Z" /><path d="M16 9c2-1 4-1 4-1M14 12h.01" /><path d="M20 7c1 2 1 4 0 6" /></>,
```

- [ ] **Step 3: Add a registry-integrity test**

Create `src/lib/nutrients.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { NUTRIENTS, NUTRIENT_KEYS, seedTargets, emptyNutrientMap } from './nutrients'

describe('nutrient registry', () => {
  it('has 17 nutrients with complete, unique definitions', () => {
    expect(NUTRIENTS).toHaveLength(17)
    expect(new Set(NUTRIENT_KEYS).size).toBe(17)
    for (const n of NUTRIENTS) {
      expect(n.key && n.label && n.unit && n.group && n.icon && n.why).toBeTruthy()
      expect(n.adultRda).toBeGreaterThan(0)
      expect(n.kidRda).toBeGreaterThan(0)
    }
  })

  it('seedTargets returns a value for every nutrient', () => {
    expect(Object.keys(seedTargets('adult'))).toHaveLength(17)
    expect(Object.keys(seedTargets('kid'))).toHaveLength(17)
  })

  it('emptyNutrientMap is all nulls', () => {
    const m = emptyNutrientMap()
    expect(Object.values(m).every((v) => v === null)).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/nutrients.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck & commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/lib/nutrients.ts src/lib/nutrients.test.ts src/components/Icon.tsx
git commit -m "feat: nutrient registry + nutrient icons"
```

---

### Task 2: Amount scaling & per-slot counts

**Files:**
- Create: `src/lib/scale.ts`
- Create: `src/lib/scale.test.ts`

- [ ] **Step 1: Implement scale.ts**

Create `src/lib/scale.ts`:

```ts
import type { PickSlot, PoolSlot } from './mealPlan'

// Format a number back to a short string: nice common fractions, else trimmed decimal.
function formatQty(n: number): string {
  const whole = Math.floor(n)
  const frac = n - whole
  const eighths = Math.round(frac * 8)
  const FRAC: Record<number, string> = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' }
  if (eighths === 0) return String(whole)
  if (eighths === 8) return String(whole + 1)
  const f = FRAC[eighths]
  if (f) return whole > 0 ? `${whole} ${f}` : f
  return String(Math.round(n * 100) / 100)
}

// Parse a leading quantity (int, decimal, "a/b", or "a b/c") and return [value, restString].
function parseLeadingQty(s: string): [number, string] | null {
  const m = s.match(/^\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+)|\/(\d+))?\s*/)
  if (!m) return null
  const lead = parseFloat(m[1])
  let value = lead
  if (m[2] && m[3]) value = lead + parseInt(m[2], 10) / parseInt(m[3], 10) // mixed: "1 1/2"
  else if (m[4]) value = lead / parseInt(m[4], 10) // simple: "1/2"
  return [value, s.slice(m[0].length)]
}

// Scale a free-text ingredient amount by `factor`. Non-numeric/empty amounts are unchanged.
export function scaleAmount(amount: string, factor: number): string {
  if (factor === 1 || !amount.trim()) return amount
  const parsed = parseLeadingQty(amount)
  if (!parsed) return amount
  const [value, rest] = parsed
  const scaled = formatQty(value * factor)
  return rest ? `${scaled} ${rest.trim()}` : scaled
}

// kid slots scale by the kid count; everything else by the family count.
export function countForSlot(slot: PickSlot | PoolSlot, familyCount: number, kidCount: number): number {
  return slot === 'kid' || slot === 'kid-lunch' || slot === 'kid-snack' ? kidCount : familyCount
}
```

- [ ] **Step 2: Write tests**

Create `src/lib/scale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scaleAmount, countForSlot } from './scale'

describe('scaleAmount', () => {
  it('multiplies whole numbers and units', () => {
    expect(scaleAmount('200 g', 3)).toBe('600 g')
    expect(scaleAmount('2 cups', 2)).toBe('4 cups')
  })
  it('handles fractions and mixed numbers', () => {
    expect(scaleAmount('1/2 tsp', 3)).toBe('1 1/2 tsp')
    expect(scaleAmount('1 1/2 cup', 2)).toBe('3 cup')
  })
  it('handles decimals', () => {
    expect(scaleAmount('0.5 kg', 2)).toBe('1 kg')
  })
  it('leaves non-numeric and empty unchanged', () => {
    expect(scaleAmount('a pinch', 4)).toBe('a pinch')
    expect(scaleAmount('', 4)).toBe('')
  })
  it('factor 1 is identity', () => {
    expect(scaleAmount('1 1/3 cup', 1)).toBe('1 1/3 cup')
  })
})

describe('countForSlot', () => {
  it('kid slots use kid count', () => {
    expect(countForSlot('kid', 4, 2)).toBe(2)
    expect(countForSlot('kid-lunch', 4, 2)).toBe(2)
    expect(countForSlot('kid-snack', 4, 2)).toBe(2)
  })
  it('family slots use family count', () => {
    expect(countForSlot('breakfast', 4, 2)).toBe(4)
    expect(countForSlot('dinner', 4, 2)).toBe(4)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npm test -- src/lib/scale.test.ts`
Expected: PASS. (If `formatQty` rounding differs for an assertion, adjust the expected string to the actual output — the rounding rule is the spec, not the literal.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/scale.ts src/lib/scale.test.ts
git commit -m "feat: ingredient amount scaling + per-slot counts"
```

---

### Task 3: Nutrition rollup & comparison rows

**Files:**
- Create: `src/lib/nutrition.ts`
- Create: `src/lib/nutrition.test.ts`

- [ ] **Step 1: Implement nutrition.ts**

Create `src/lib/nutrition.ts`:

```ts
import { NUTRIENTS, type NutrientDef, type NutrientMap } from './nutrients'

// Sum per-person nutrient maps across recipes. Missing/null values count as 0.
export function sumNutrients(maps: (NutrientMap | null | undefined)[]): NutrientMap {
  const total: NutrientMap = {}
  for (const def of NUTRIENTS) {
    let sum = 0
    for (const m of maps) {
      const v = m?.[def.key]
      if (typeof v === 'number') sum += v
    }
    total[def.key] = sum
  }
  return total
}

export interface NutrientRow {
  def: NutrientDef
  value: number
  target: number
  pct: number // 0..1 (clamped)
}

// Pair each nutrient's actual value with a target map for display.
export function buildNutrientRows(
  values: NutrientMap,
  targets: Record<string, number>,
  defs: NutrientDef[] = NUTRIENTS,
): NutrientRow[] {
  return defs.map((def) => {
    const value = typeof values[def.key] === 'number' ? (values[def.key] as number) : 0
    const target = targets[def.key] ?? def.adultRda
    const pct = target > 0 ? Math.min(1, value / target) : 0
    return { def, value, target, pct }
  })
}
```

- [ ] **Step 2: Write tests**

Create `src/lib/nutrition.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sumNutrients, buildNutrientRows } from './nutrition'
import { seedTargets } from './nutrients'

describe('sumNutrients', () => {
  it('adds per-person values and treats null/missing as 0', () => {
    const total = sumNutrients([{ calories: 400, protein: 20 }, { calories: 300, protein: null }])
    expect(total.calories).toBe(700)
    expect(total.protein).toBe(20)
  })
})

describe('buildNutrientRows', () => {
  it('computes pct against the chosen target map', () => {
    const rows = buildNutrientRows({ calories: 1000 }, seedTargets('adult'))
    const cal = rows.find((r) => r.def.key === 'calories')!
    expect(cal.target).toBe(2000)
    expect(cal.pct).toBeCloseTo(0.5)
  })
  it('kid targets differ from adult', () => {
    const rows = buildNutrientRows({ calories: 1400 }, seedTargets('kid'))
    expect(rows.find((r) => r.def.key === 'calories')!.target).toBe(1400)
  })
})
```

- [ ] **Step 3: Run tests & commit**

Run: `npm test -- src/lib/nutrition.test.ts`
Expected: PASS.

```bash
git add src/lib/nutrition.ts src/lib/nutrition.test.ts
git commit -m "feat: nutrition rollup and comparison rows"
```

---

## Phase B — Data model

### Task 4: Migration 0009 (schema + RPC + data reset)

**Files:**
- Create: `supabase/migrations/0009_per_person_nutrition.sql`

> Targets are seeded by column DEFAULT (a literal JSON built from the registry values in Task 1). Keep these two JSON literals in sync with `seedTargets()`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_per_person_nutrition.sql`:

```sql
-- Per-person nutrition model + family scaling.
-- Existing recipes are deleted for a clean cutover to the nutrients JSON map.

-- 1. Recipes: replace flat nutrition columns with a per-person nutrients map.
delete from recipes;
alter table recipes drop column if exists calories;
alter table recipes drop column if exists protein;
alter table recipes drop column if exists fiber;
alter table recipes add column if not exists nutrients jsonb not null default '{}'::jsonb;

-- 2. Household settings: adults count + editable Adult/Kid target maps.
alter table household_settings add column if not exists adults int not null default 2;

alter table household_settings add column if not exists targets_adult jsonb not null default
  '{"calories":2000,"protein":90,"carbs":275,"healthy_fats":70,"fiber":28,"vitamin_a":900,"vitamin_c":90,"vitamin_d":20,"folate":400,"choline":550,"vitamin_b12":2.4,"iron":18,"calcium":1300,"potassium":4700,"zinc":11,"magnesium":420,"omega_3":1.6}'::jsonb;

alter table household_settings add column if not exists targets_kid jsonb not null default
  '{"calories":1400,"protein":19,"carbs":130,"healthy_fats":50,"fiber":25,"vitamin_a":400,"vitamin_c":25,"vitamin_d":15,"folate":200,"choline":250,"vitamin_b12":1.2,"iron":10,"calcium":1000,"potassium":2300,"zinc":5,"magnesium":130,"omega_3":0.9}'::jsonb;

-- Old per-nutrient columns are now redundant (targets live in the JSON maps).
alter table household_settings drop column if exists target_calories;
alter table household_settings drop column if exists target_protein;
alter table household_settings drop column if exists target_fiber;

-- 3. Replace onboarding RPC: drop the 3 nutrition params, add adults.
drop function if exists create_household_with_setup(text, text, text[], int, int, int, time, time);

create or replace function create_household_with_setup(
  p_name text,
  p_display_name text,
  p_kids text[],
  p_adults int,
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

  -- targets_adult / targets_kid use their column defaults (seeded above).
  insert into household_settings (household_id, adults, evening_reminder_time, morning_reminder_time)
    values (v_household_id, coalesce(p_adults, 2), p_evening, p_morning);

  if p_kids is not null then
    foreach v_kid in array p_kids loop
      if length(trim(v_kid)) > 0 then
        insert into kids (household_id, name) values (v_household_id, v_kid);
      end if;
    end loop;
  end if;

  return v_household_id;
end;
$$;

grant execute on function create_household_with_setup(text, text, text[], int, time, time) to authenticated;
```

- [ ] **Step 2: Note for the user (manual apply)**

This migration must be applied in the Supabase SQL editor (as with prior migrations). Add to the task's completion notes: "Apply `0009_per_person_nutrition.sql` in Supabase before testing against the live DB." Do not block the build on it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0009_per_person_nutrition.sql
git commit -m "feat: migration 0009 per-person nutrients + editable targets + adults"
```

---

### Task 5: Recipe types, draft, normalize

**Files:**
- Modify: `src/lib/recipe.ts`
- Modify: `src/lib/recipeDraft.ts`
- Modify: `src/lib/recipeNormalize.ts`

- [ ] **Step 1: Update recipe.ts schema**

In `src/lib/recipe.ts`, add the nutrients import and replace the three nutrition lines.

Add at top (after `import { z }`):

```ts
import { NUTRIENT_KEYS } from './nutrients'
```

Replace:

```ts
  calories: z.number().int().nonnegative().nullable(),
  protein: z.number().int().nonnegative().nullable(),
  fiber: z.number().int().nonnegative().nullable(),
  nutrition_estimated: z.boolean(),
```

with:

```ts
  nutrients: z.record(z.string(), z.number().nonnegative().nullable()),
  nutrition_estimated: z.boolean(),
```

Add an exported helper at the end of the file:

```ts
// Coerce a stored/loose value into a complete per-person map keyed by the registry.
export function toNutrientMap(value: unknown): Record<string, number | null> {
  const src = (value ?? {}) as Record<string, unknown>
  const out: Record<string, number | null> = {}
  for (const k of NUTRIENT_KEYS) {
    const v = src[k]
    out[k] = typeof v === 'number' ? v : null
  }
  return out
}
```

- [ ] **Step 2: Update recipeDraft.ts**

In `src/lib/recipeDraft.ts` replace the three nutrition fields in `recipeDraftSchema`:

```ts
  calories: z.number().int().nonnegative().nullable().default(null),
  protein: z.number().int().nonnegative().nullable().default(null),
  fiber: z.number().int().nonnegative().nullable().default(null),
  nutrition_estimated: z.boolean().default(false),
```

with:

```ts
  nutrients: z.record(z.string(), z.number().nonnegative().nullable()).default({}),
  nutrition_estimated: z.boolean().default(false),
```

And in `draftToRecipeInput`, replace the `calories/protein/fiber` lines with:

```ts
    nutrients: toNutrientMap(draft.nutrients),
```

Add the import at top:

```ts
import { toNutrientMap } from './recipe'
```

- [ ] **Step 3: Update recipeNormalize.ts**

`normalizeRecipeInput` spreads `...input`, so `nutrients` carries through unchanged — no edit needed for the map. Confirm by reading the file; no change required.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: errors ONLY in not-yet-updated consumers (RecipeForm, RecipeDetail, MealCard, RecipeCard, recipe.test). That is expected at this point.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipe.ts src/lib/recipeDraft.ts
git commit -m "feat: recipe nutrients map replaces calories/protein/fiber"
```

---

### Task 6: HouseholdProvider counts + targets

**Files:**
- Modify: `src/lib/householdDefaults.ts`
- Modify: `src/context/HouseholdProvider.tsx`

- [ ] **Step 1: Update householdDefaults.ts**

Replace the contents of `src/lib/householdDefaults.ts` with:

```ts
import { seedTargets } from './nutrients'

export interface HouseholdSettings {
  adults: number
  targets_adult: Record<string, number>
  targets_kid: Record<string, number>
  evening_reminder_time: string
  morning_reminder_time: string
  timezone: string
}

export function defaultTargets(): HouseholdSettings {
  return {
    adults: 2,
    targets_adult: seedTargets('adult'),
    targets_kid: seedTargets('kid'),
    evening_reminder_time: '20:00',
    morning_reminder_time: '07:00',
    timezone: 'UTC',
  }
}
```

- [ ] **Step 2: Update HouseholdProvider.tsx**

In `src/context/HouseholdProvider.tsx`, extend `HouseholdState` and the context value with derived counts and target maps. Add to the interface:

```ts
  adults: number
  familyCount: number
  kidCount: number
  targetsAdult: Record<string, number>
  targetsKid: Record<string, number>
```

In the provider body, after `settings` is known, compute (add before the `return`):

```ts
  const adults = settings?.adults ?? 2
  const kidCount = kids.length
  const familyCount = adults + kidCount
  const targetsAdult = settings?.targets_adult ?? defaultTargets().targets_adult
  const targetsKid = settings?.targets_kid ?? defaultTargets().targets_kid
```

Add `import { defaultTargets } from '../lib/householdDefaults'` at top, and include the new fields in both the default context object and the provider's `value={{ ... }}`.

- [ ] **Step 3: Typecheck & commit**

Run: `npm run typecheck`
Expected: same consumer errors as Task 5 plus Settings/Onboarding/Today (updated in later tasks). No errors in these two files.

```bash
git add src/lib/householdDefaults.ts src/context/HouseholdProvider.tsx
git commit -m "feat: household provider exposes counts + target maps"
```

---

## Phase C — Backend AI import

### Task 7: Per-person 17-nutrient extraction

**Files:**
- Modify: `server/src/prompt.ts`

- [ ] **Step 1: Update the system prompt and JSON schema**

In `server/src/prompt.ts`:

Add an import for the keys at top:

```ts
import { MEAL_TYPES, RECIPE_TAGS } from '../../src/lib/recipe'
import { NUTRIENT_KEYS } from '../../src/lib/nutrients'
```

Replace the nutrition rule line in `SYSTEM` with:

```ts
  '- Nutrition: provide a `nutrients` object with PER-ONE-PERSON values for these keys: ' + NUTRIENT_KEYS.join(', ') + '.',
  '  Units: calories=kcal; protein/carbs/healthy_fats/fiber/omega_3=grams; vitamin_a/vitamin_d/folate=µg; vitamin_b12=µg; vitamin_c/choline/iron/calcium/potassium/zinc/magnesium=mg.',
  '  If the source serves multiple people, DIVIDE all nutrition by the serving count so values are per one person.',
  '  Use stated values when present; otherwise estimate sensible numbers. Use null only when you truly cannot estimate. Set nutrition_estimated=true if any value was estimated.',
  '- ingredients: amount (e.g. "200 g", "1 cup", or "") and item. NORMALIZE amounts to ONE serving (divide by the source serving count).',
```

Replace the `calories/protein/fiber` properties in `RECIPE_JSON_SCHEMA.schema.properties` with a `nutrients` object, and update `required`:

```ts
      nutrients: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, { type: ['number', 'null'] }])),
        required: [...NUTRIENT_KEYS],
      },
      nutrition_estimated: { type: 'boolean' },
```

Update the `required` array of the top-level schema: replace `'calories', 'protein', 'fiber'` with `'nutrients'`.

- [ ] **Step 2: Server typecheck**

Run: `npm run typecheck:server`
Expected: no errors. (If `importHandler.ts` references `calories/protein/fiber` on the draft, update it to pass `nutrients` through — it should already validate via `recipeDraftSchema`.)

- [ ] **Step 3: Update importHandler test if it asserts old fields**

Read `server/src/importHandler.test.ts`. If it asserts `calories`/`protein`/`fiber`, change those assertions to check `nutrients.calories` etc. Run:

Run: `npm test -- server/src/importHandler.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/prompt.ts server/src/importHandler.test.ts
git commit -m "feat: AI import extracts per-person 17-nutrient map"
```

---

## Phase D — Input UI

### Task 8: RecipeForm — 17-nutrient inputs

**Files:**
- Modify: `src/routes/RecipeForm.tsx`

- [ ] **Step 1: Replace nutrition state with a nutrient map**

In `src/routes/RecipeForm.tsx`:

Add imports:

```ts
import { NUTRIENTS, GROUP_LABELS, NUTRIENT_GROUPS, emptyNutrientMap, type NutrientMap } from '../lib/nutrients'
import { toNutrientMap } from '../lib/recipe'
```

Replace the three `calories/protein/fiber` state hooks with:

```ts
  const [nutrients, setNutrients] = useState<NutrientMap>(() =>
    draft?.nutrients ? toNutrientMap(draft.nutrients) : emptyNutrientMap())
```

In the edit-load effect, replace `setCalories/setProtein/setFiber(...)` with:

```ts
        setNutrients(toNutrientMap(recipe.nutrients))
```

Add a setter helper near `numFromInput`:

```ts
  function setNutrient(key: string, v: string) {
    setNutrients((prev) => ({ ...prev, [key]: numFromInput(v) }))
  }
```

In `submit`, replace the `calories/protein/fiber` lines in `input` with:

```ts
      nutrients,
```

- [ ] **Step 2: Replace the Nutrition form section**

Replace the entire `<div>` block containing the 3-column Calories/Protein/Fiber inputs (the `<label className="text-xs font-bold text-gray-500 uppercase">Nutrition</label>` block) with:

```tsx
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Nutrition</label>
          <p className="text-xs text-gray-400 mt-0.5">Enter values for <b>one person</b> (one serving).</p>
          {NUTRIENT_GROUPS.map((group) => (
            <div key={group} className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{GROUP_LABELS[group]}</p>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {NUTRIENTS.filter((n) => n.group === group).map((n) => (
                  <label key={n.key} className="text-xs text-gray-500">{n.label} {n.unit && `(${n.unit})`}
                    <input type="number" className="w-full border rounded-xl p-2 mt-1"
                      aria-label={n.label}
                      value={nutrients[n.key] ?? ''} onChange={(e) => setNutrient(n.key, e.target.value)} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="flex items-center gap-2 mt-2 text-sm text-gray-500">
            <input type="checkbox" checked={nutritionEstimated}
              onChange={(e) => setNutritionEstimated(e.target.checked)} />
            ≈ estimated
          </label>
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors in RecipeForm.

- [ ] **Step 4: Update RecipeForm.test.tsx if it references calories/protein/fiber**

Read `src/routes/RecipeForm.test.tsx`. Replace any `aria-label="Calories"` field assertions still valid (Calories label still exists). If a test set protein/fiber and asserted the saved object's `calories`, update to assert `nutrients.calories`. Run:

Run: `npm test -- src/routes/RecipeForm.test.tsx`
Expected: PASS (update expectations to the nutrients map as needed).

- [ ] **Step 5: Commit**

```bash
git add src/routes/RecipeForm.tsx src/routes/RecipeForm.test.tsx
git commit -m "feat: recipe form captures full per-person nutrient set"
```

---

### Task 9: Onboarding adults + Settings (adults + editable targets)

**Files:**
- Modify: `src/lib/onboardingSchema.ts`
- Modify: `src/routes/Onboarding.tsx`
- Modify: `src/lib/settingsData.ts`
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Update onboardingSchema.ts**

Replace `src/lib/onboardingSchema.ts` with:

```ts
import { z } from 'zod'

export const onboardingSchema = z.object({
  householdName: z.string().trim().min(1, 'Household name is required'),
  displayName: z.string().trim().min(1, 'Your name is required'),
  kids: z.array(z.object({ name: z.string().trim().min(1, 'Kid name is required') })),
  adults: z.number().int().positive(),
  evening_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
  morning_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
```

- [ ] **Step 2: Update Onboarding.tsx**

In `src/routes/Onboarding.tsx`:

Add adults state: `const [adults, setAdults] = useState(2)`.

Replace the `onboardingSchema.safeParse({...})` call's payload with:

```ts
      householdName, displayName, kids: kids.map((k) => ({ name: k.name })),
      adults,
      evening_reminder_time: targets.evening_reminder_time,
      morning_reminder_time: targets.morning_reminder_time,
```

Replace the `supabase.rpc('create_household_with_setup', {...})` args with:

```ts
      p_name: householdName,
      p_display_name: displayName,
      p_kids: kids.map((k) => k.name),
      p_adults: adults,
      p_evening: targets.evening_reminder_time,
      p_morning: targets.morning_reminder_time,
```

Replace the 3-column Calories/Protein/Fiber `<div className="grid grid-cols-3 ...">` block with an adults input:

```tsx
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Adults in the household</label>
          <input type="number" min={1} className="w-full border rounded-xl p-3 mt-1"
            aria-label="Adults" value={adults}
            onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))} />
          <p className="text-xs text-gray-400 mt-1">Nutrition targets can be fine-tuned later in Settings.</p>
        </div>
```

(The `targets` state still supplies reminder times; leave it.)

- [ ] **Step 3: Add target/adults persistence to settingsData.ts**

Append to `src/lib/settingsData.ts`:

```ts
export interface NutritionSettingsInput {
  adults: number
  targets_adult: Record<string, number>
  targets_kid: Record<string, number>
}

export async function updateNutritionSettings(householdId: string, input: NutritionSettingsInput): Promise<void> {
  const { error } = await supabase
    .from('household_settings')
    .update(input)
    .eq('household_id', householdId)
  if (error) throw error
}
```

- [ ] **Step 4: Add adults + editable targets section to Settings.tsx**

In `src/routes/Settings.tsx`:

Add imports:

```ts
import { NUTRIENTS, GROUP_LABELS, NUTRIENT_GROUPS } from '../lib/nutrients'
import { updateNutritionSettings } from '../lib/settingsData'
```

Add state (after the existing settings-derived state):

```ts
  const [adults, setAdults] = useState(base.adults)
  const [tAdult, setTAdult] = useState<Record<string, number>>(base.targets_adult)
  const [tKid, setTKid] = useState<Record<string, number>>(base.targets_kid)
  const [tab, setTab] = useState<'adult' | 'kid'>('adult')
  const [nutSaving, setNutSaving] = useState(false)
  const [nutSaved, setNutSaved] = useState(false)
```

Add a save handler:

```ts
  async function handleSaveNutrition() {
    if (!householdId) return
    setNutSaving(true); setNutSaved(false)
    try {
      await updateNutritionSettings(householdId, { adults, targets_adult: tAdult, targets_kid: tKid })
      await refresh()
      setNutSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setNutSaving(false)
    }
  }
```

Add a new `<section>` (place it after the "Reminder times" section):

```tsx
      <section className="space-y-3 pt-2 border-t border-gray-100">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Household &amp; nutrition targets</h2>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Adults</span>
          <input type="number" min={1} value={adults}
            onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-20" />
        </label>

        <div className="flex gap-1">
          {(['adult', 'kid'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`text-xs font-semibold rounded-full px-3 py-1 ${tab === t ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'}`}>
              {t === 'adult' ? 'Adult needs' : 'Kid needs'}
            </button>
          ))}
        </div>

        {NUTRIENT_GROUPS.map((group) => (
          <div key={group}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-2">{GROUP_LABELS[group]}</p>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {NUTRIENTS.filter((n) => n.group === group).map((n) => {
                const map = tab === 'adult' ? tAdult : tKid
                const set = tab === 'adult' ? setTAdult : setTKid
                return (
                  <label key={n.key} className="text-xs text-gray-500">{n.label} {n.unit && `(${n.unit})`}
                    <input type="number" className="w-full border rounded-xl p-2 mt-1" aria-label={`${tab} ${n.label}`}
                      value={map[n.key] ?? ''}
                      onChange={(e) => set({ ...map, [n.key]: Number(e.target.value) || 0 })} />
                  </label>
                )
              })}
            </div>
          </div>
        ))}
        {nutSaved && <p className="text-brand text-sm font-semibold">Saved ✓</p>}
        <button type="button" onClick={handleSaveNutrition} disabled={nutSaving}
          className="w-full bg-brand text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50">
          {nutSaving ? 'Saving…' : 'Save targets'}
        </button>
      </section>
```

- [ ] **Step 5: Typecheck & test**

Run: `npm run typecheck`
Expected: no errors in these files.
Run: `npm test -- src/lib/onboardingSchema.test.ts src/routes/Onboarding.test.tsx src/lib/householdDefaults.test.ts`
Expected: PASS. Update those tests to the new shape (adults instead of target_calories/protein/fiber) — replace assertions on `target_*` with `adults` / `targets_adult.calories`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboardingSchema.ts src/routes/Onboarding.tsx src/lib/settingsData.ts src/routes/Settings.tsx src/lib/onboardingSchema.test.ts src/routes/Onboarding.test.tsx src/lib/householdDefaults.test.ts
git commit -m "feat: onboarding adults + editable adult/kid nutrition targets in settings"
```

---

## Phase E — Display UI

### Task 10: NutritionPanel component

**Files:**
- Create: `src/components/NutritionPanel.tsx`

- [ ] **Step 1: Build the panel**

Create `src/components/NutritionPanel.tsx`:

```tsx
import { useState } from 'react'
import { NUTRIENT_GROUPS, GROUP_LABELS, nutrientsByGroup, type NutrientMap } from '../lib/nutrients'
import { buildNutrientRows } from '../lib/nutrition'
import Icon from './Icon'

interface Props {
  values: NutrientMap // per person
  targetsAdult: Record<string, number>
  targetsKid: Record<string, number>
  estimated?: boolean
}

export default function NutritionPanel({ values, targetsAdult, targetsKid, estimated }: Props) {
  const [who, setWho] = useState<'adult' | 'kid'>('adult')
  const targets = who === 'adult' ? targetsAdult : targetsKid

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">Nutrition · per person</h2>
        <div className="flex gap-1">
          {(['adult', 'kid'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setWho(t)}
              className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${who === t ? 'bg-terracotta text-bone-surface' : 'bg-ink/5 text-ink-soft'}`}>
              {t === 'adult' ? 'Adult' : 'Kid'}
            </button>
          ))}
        </div>
      </div>

      {NUTRIENT_GROUPS.map((group) => {
        const rows = buildNutrientRows(values, targets, nutrientsByGroup(group))
        return (
          <div key={group}>
            <p className="eyebrow text-terracotta mb-2">{GROUP_LABELS[group]}</p>
            <div className="grid grid-cols-3 gap-2.5">
              {rows.map(({ def, value, target, pct }) => (
                <div key={def.key} className="rounded-xl border border-ink/10 bg-bone-surface/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-olive">
                    <Icon name={def.icon} size={18} />
                    <span className="font-display text-[16px] leading-none text-ink nums">
                      {Math.round(value * 10) / 10}<span className="text-[11px] text-ink-faint">{def.unit && ` ${def.unit}`}</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] font-semibold text-ink">{def.label}</p>
                  <p className="text-[10.5px] text-ink-soft leading-snug">{def.why}</p>
                  <div className="mt-1.5 h-[3px] w-full rounded-full bg-ink/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: pct >= 1 ? '#5e6b3f' : '#b8512e' }} />
                  </div>
                  <p className="mt-1 text-[10px] text-ink-faint nums">of {target}{def.unit && ` ${def.unit}`} / day</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {estimated && <p className="text-[11px] text-ink-faint">✺ Values AI-estimated · per person</p>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `npm run typecheck`
Expected: no errors in this file.

```bash
git add src/components/NutritionPanel.tsx
git commit -m "feat: NutritionPanel with adult/kid comparison"
```

---

### Task 11: RecipeDetail — panel + ingredient Serves stepper

**Files:**
- Modify: `src/routes/RecipeDetail.tsx`

- [ ] **Step 1: Wire in counts, targets, and a serves stepper**

In `src/routes/RecipeDetail.tsx`:

Add imports:

```ts
import { useHousehold } from '../context/HouseholdProvider'
import { toNutrientMap } from '../lib/recipe'
import { scaleAmount } from '../lib/scale'
import NutritionPanel from '../components/NutritionPanel'
```

Add a `serves` state (with the other `useState`s):

```ts
  const [serves, setServes] = useState(1)
```

Get household targets/counts (inside the component, after `const { id } = useParams()`):

```ts
  const { familyCount, targetsAdult, targetsKid } = useHousehold()
```

Remove the old `nutritionLine` function and the hero `nutrition` line usage (delete the `const nutrition = nutritionLine(recipe)` and the `{nutrition && (...)}` block in the hero, or keep the hero clean with just the title). Replace the hero subtitle block with nothing (title only).

Replace the Ingredients section with a Serves stepper + scaled amounts:

```tsx
        {recipe.ingredients.length > 0 && (
          <div className="pt-2 rule">
            <div className="flex items-center justify-between mb-3 mt-4">
              <h2 className="eyebrow">Ingredients</h2>
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-eyebrow text-ink-faint">Serves</span>
                <button type="button" aria-label="Fewer servings" onClick={() => setServes((s) => Math.max(1, s - 1))}
                  className="h-7 w-7 rounded-full border border-ink/15 text-ink-soft">−</button>
                <span className="font-display text-[18px] text-ink nums w-5 text-center">{serves}</span>
                <button type="button" aria-label="More servings" onClick={() => setServes((s) => Math.min(12, s + 1))}
                  className="h-7 w-7 rounded-full border border-ink/15 text-ink-soft">+</button>
              </div>
            </div>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => {
                const amount = scaleAmount(ing.amount, serves)
                return (
                  <li key={i} className="text-[15px] text-ink-soft">
                    {amount ? `${amount} · ${ing.item}` : ing.item}
                  </li>
                )
              })}
            </ul>
            {familyCount > 1 && (
              <button type="button" onClick={() => setServes(familyCount)}
                className="mt-2 text-[12px] font-semibold text-terracotta">Scale to my family ({familyCount})</button>
            )}
          </div>
        )}
```

Add the nutrition panel below the Method section (before the Delete button):

```tsx
        <div className="pt-2 rule">
          <div className="mt-4">
            <NutritionPanel
              values={toNutrientMap(recipe.nutrients)}
              targetsAdult={targetsAdult}
              targetsKid={targetsKid}
              estimated={recipe.nutrition_estimated}
            />
          </div>
        </div>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors in RecipeDetail.

- [ ] **Step 3: Update RecipeDetail.test.tsx**

Read `src/routes/RecipeDetail.test.tsx`. If it asserts the old nutrition line (`"420 cal"` text), change it to assert a nutrient label rendered by the panel (e.g. `getByText('Calories')`). Provide `nutrients` in the mock recipe instead of `calories/protein/fiber`. Run:

Run: `npm test -- src/routes/RecipeDetail.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/RecipeDetail.tsx src/routes/RecipeDetail.test.tsx
git commit -m "feat: recipe detail shows nutrition panel + serves stepper"
```

---

### Task 12: NutritionStrip + Today two rollups

**Files:**
- Modify: `src/components/NutritionStrip.tsx`
- Modify: `src/routes/Today.tsx`

- [ ] **Step 1: Generalize NutritionStrip**

Replace `src/components/NutritionStrip.tsx` with:

```tsx
import type { NutrientRow } from '../lib/nutrition'

export default function NutritionStrip({ rows }: { rows: NutrientRow[] }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-ink/10 border-y border-ink/10 py-4">
      {rows.map(({ def, value, target, pct }) => {
        const met = target > 0 && value >= target
        return (
          <div key={def.key} className="px-2 text-center">
            <p className="eyebrow">{def.label}</p>
            <p className="mt-2 font-display text-[22px] leading-none font-medium text-ink nums">
              {Math.round(value)}<span className="text-[15px] text-ink-faint">{def.unit === 'kcal' ? '' : def.unit}</span>
            </p>
            <p className="mt-1 text-[11px] text-ink-faint nums">of {target}{def.unit === 'kcal' ? '' : def.unit}</p>
            <div className="mt-2 mx-auto h-[3px] w-10 rounded-full bg-ink/10 overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-700 ease-editorial"
                style={{ width: `${pct * 100}%`, backgroundColor: met ? '#5e6b3f' : '#b8512e' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Update Today.tsx — two per-person rollups vs need**

In `src/routes/Today.tsx`:

Replace imports for defaults and add new ones:

```ts
import { useHousehold } from '../context/HouseholdProvider'
import { HEADLINE_NUTRIENTS } from '../lib/nutrients'
import { toNutrientMap } from '../lib/recipe'
import { sumNutrients, buildNutrientRows } from '../lib/nutrition'
```

Pull targets from the household:

```ts
  const { householdId, kids, displayName, targetsAdult, targetsKid } = useHousehold()
```

Replace the old `targets` and `totals` computation with per-slot rollups:

```ts
  const familySlots = new Set<PickSlot>(['breakfast', 'lunch', 'dinner'])
  const kidSlots = new Set<PickSlot>(['kid-lunch', 'kid-snack'])

  const familyTotals = sumNutrients(picks.filter((p) => familySlots.has(p.slot)).map((p) => toNutrientMap(p.recipe.nutrients)))
  const kidTotals = sumNutrients(picks.filter((p) => kidSlots.has(p.slot)).map((p) => toNutrientMap(p.recipe.nutrients)))

  const youRows = buildNutrientRows(familyTotals, targetsAdult, HEADLINE_NUTRIENTS)
  const kidRows = buildNutrientRows(kidTotals, targetsKid, HEADLINE_NUTRIENTS)
```

Replace the single `<NutritionStrip .../>` in the JSX with a "You" strip, captioned per person:

```tsx
          <StaggerItem className="space-y-1.5">
            <p className="eyebrow text-ink-faint">Your day · per person</p>
            <NutritionStrip rows={youRows} />
          </StaggerItem>
```

In the Kid's School Box `StaggerItem`, add a kid rollup strip above the kid meal cards (only render when there are kid picks):

```tsx
              {(pickBySlot.has('kid-lunch') || pickBySlot.has('kid-snack')) && (
                <>
                  <p className="eyebrow text-olive">Kid&apos;s day · per person</p>
                  <NutritionStrip rows={kidRows} />
                </>
              )}
```

Remove the now-unused `defaultTargets` import if present.

- [ ] **Step 3: Typecheck & commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/components/NutritionStrip.tsx src/routes/Today.tsx
git commit -m "feat: home shows per-person You + Kid rollups vs need"
```

---

### Task 13: Shop — scale ingredient amounts per slot

**Files:**
- Modify: `src/lib/pantry.ts`
- Modify: `src/routes/Shop.tsx`

- [ ] **Step 1: Make buildShoppingRows scale by a per-recipe factor**

In `src/lib/pantry.ts`, change the `buildShoppingRows` recipe input type to carry a `scale` factor and apply `scaleAmount`:

Add import at top:

```ts
import { scaleAmount } from './scale'
```

Replace the `buildShoppingRows` signature/loop. New version:

```ts
export function buildShoppingRows(
  recipes: { id: string; name: string; scale: number; ingredients: { amount: string; item: string; staple?: boolean }[] }[],
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
        amount: scaleAmount(ing.amount, recipe.scale),
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

- [ ] **Step 2: Pass slot-derived scale from Shop.tsx**

In `src/routes/Shop.tsx`:

Add imports:

```ts
import { useHousehold } from '../context/HouseholdProvider'
import { countForSlot } from '../lib/scale'
```

Get counts: change `const { householdId } = useHousehold()` to:

```ts
  const { householdId, familyCount, kidCount } = useHousehold()
```

In `load`, build `{recipe, scale}` occurrences keyed by slot instead of dropping the slot. Replace the recipes branch:

```ts
        mode === 'week'
          ? getFullPool(householdId, week).then((entries: PoolEntry[]) =>
              entries.map((e) => ({ recipe: e.recipe, scale: countForSlot(e.slot, familyCount, kidCount) })))
          : getPicksForDate(householdId, tomorrow).then((picks: DailyPick[]) =>
              picks.map((p) => ({ recipe: p.recipe, scale: countForSlot(p.slot, familyCount, kidCount) }))),
```

Replace the dedupe + buildShoppingRows call:

```ts
      const occurrences = dedupeOccurrences(recipes)
      setRows(buildShoppingRows(
        occurrences.map((o) => ({ id: o.recipe.id, name: o.recipe.name, scale: o.scale, ingredients: o.recipe.ingredients })),
        pantryItems as PantryItem[], checkSet, staples.map((s) => s.name)))
```

Replace the `dedupeRecipes` helper at the bottom with one that keeps the highest scale per recipe id (so a recipe used in both a family and kid slot buys for the larger count):

```ts
function dedupeOccurrences(
  occ: { recipe: { id: string; name: string; ingredients: { amount: string; item: string }[] }; scale: number }[],
) {
  const byId = new Map<string, { recipe: typeof occ[number]['recipe']; scale: number }>()
  for (const o of occ) {
    const prev = byId.get(o.recipe.id)
    if (!prev || o.scale > prev.scale) byId.set(o.recipe.id, o)
  }
  return [...byId.values()]
}
```

Add a "Quantities for N" note in the header — under the `<ScreenHeader eyebrow="Market List" title="Shop" />` add:

```tsx
        <p className="text-[12px] text-ink-faint mt-1">Quantities for your family ({familyCount}{kidCount > 0 ? `, kid items ×${kidCount}` : ''}).</p>
```

- [ ] **Step 3: Update pantry.test.ts**

Read `src/lib/pantry.test.ts`. Add `scale: 1` to every recipe object passed to `buildShoppingRows`, and add one assertion that `scale: 3` triples a numeric amount (e.g. `'200 g'` → `'600 g'`). Run:

Run: `npm test -- src/lib/pantry.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck & commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/lib/pantry.ts src/routes/Shop.tsx src/lib/pantry.test.ts
git commit -m "feat: shop scales ingredient quantities by family/kid count"
```

---

### Task 14: MealCard & RecipeCard headline nutrition

**Files:**
- Modify: `src/components/MealCard.tsx`
- Modify: `src/components/RecipeCard.tsx`

- [ ] **Step 1: Update MealCard.tsx**

In `src/components/MealCard.tsx`, replace the `nutritionLine` helper with one driven by the registry (per person):

```ts
import { HEADLINE_NUTRIENTS } from '../lib/nutrients'
import { toNutrientMap } from '../lib/recipe'

function nutritionLine(recipe: Recipe): string | null {
  const map = toNutrientMap(recipe.nutrients)
  const parts = HEADLINE_NUTRIENTS
    .filter((n) => typeof map[n.key] === 'number')
    .map((n) => `${Math.round(map[n.key] as number)}${n.unit === 'kcal' ? ' cal' : `${n.unit} ${n.label.toLowerCase()}`}`)
  return parts.length > 0 ? parts.join('  ·  ') : null
}
```

- [ ] **Step 2: Update RecipeCard.tsx**

In `src/components/RecipeCard.tsx`, replace its `nutritionLine` with a calories+protein per-person line:

```ts
import { toNutrientMap } from '../lib/recipe'

function nutritionLine(recipe: Recipe): string | null {
  const map = toNutrientMap(recipe.nutrients)
  const parts: string[] = []
  if (typeof map.calories === 'number') parts.push(`${Math.round(map.calories)} cal`)
  if (typeof map.protein === 'number') parts.push(`${Math.round(map.protein)}g protein`)
  return parts.length > 0 ? parts.join('  ·  ') : null
}
```

- [ ] **Step 3: Typecheck & commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/components/MealCard.tsx src/components/RecipeCard.tsx
git commit -m "feat: meal/recipe cards show per-person headline nutrients"
```

---

## Phase F — Verification

### Task 15: Full verification

- [ ] **Step 1: Search for stale references**

Run: `grep -rn "target_calories\|target_protein\|target_fiber\|recipe.calories\|recipe.protein\|recipe.fiber\|\.calories ??\|setCalories\|setProtein\|setFiber" src server`
Expected: no matches. Fix any that remain (likely in `server/src/reminders.ts` or a test) — reminders that referenced `target_calories` should be removed or repointed to `targets_adult.calories`.

- [ ] **Step 2: Frontend typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Server typecheck**

Run: `npm run typecheck:server`
Expected: clean.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: all green (existing 54 + new tests). Fix any remaining test that still constructs recipes with `calories/protein/fiber` — switch to `nutrients`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verification pass for per-person nutrition & scaling"
```

- [ ] **Step 7: Completion notes for the user**

Surface these manual actions:
- Apply `supabase/migrations/0009_per_person_nutrition.sql` in the Supabase SQL editor.
- All existing recipes are deleted by the migration; re-import or re-add recipes (now per person).
- Verify the new `create_household_with_setup` signature matches the client RPC call (params: name, display_name, kids, adults, evening, morning).
- E2E on device: add a recipe → detail panel shows 17 nutrients + Adult/Kid toggle + Serves stepper; Home shows You + Kid rollups; Shop quantities scale to family count.

---

## Self-Review

**Spec coverage:**
- Per-person baseline + family scaling → Tasks 2, 11, 13. ✓
- Adults source (explicit) → Tasks 4, 6, 9. ✓
- Ingredient scaling (parse leading number) → Task 2 (`scaleAmount`), applied in 11 & 13. ✓
- Delete existing recipes / clean cutover → Task 4. ✓
- 17-nutrient registry + icons + "why" → Task 1. ✓
- Editable Adult/Kid targets, seeded defaults → Tasks 4 (defaults), 9 (edit). ✓
- AI import per-person 17 nutrients + ingredient normalization → Task 7. ✓
- Recipe page: value vs need + Adult/Kid toggle + Serves stepper (ingredients only) → Tasks 10, 11. ✓
- Home: two rollups per person vs need → Task 12. ✓
- Shop scaling per slot → Task 13. ✓
- Headline nutrients on cards → Task 14. ✓
- Tests for scaleAmount/countForSlot/rollup/buildShoppingRows/registry → Tasks 1,2,3,13. ✓

**Type consistency:** `NutrientMap` (`Record<string, number|null>`) and target maps (`Record<string, number>`) are used consistently. `toNutrientMap` is defined in `recipe.ts` (Task 5) and consumed in 8, 11, 12, 14. `buildShoppingRows` gains a required `scale` field consistently in pantry.ts and Shop.tsx (Task 13). `countForSlot` accepts both `PickSlot` and `PoolSlot` (Task 2), matching its callers in Shop (PoolSlot for week, PickSlot for tomorrow).

**Placeholder scan:** No TBD/TODO; every code step shows full code. Test-update steps (5, 7, 8, 9, 11, 13) instruct reading the existing test first because exact current assertions aren't reproduced here — acceptable since they are mechanical field renames, and each names the precise change.

**Verified, not a risk:** `server/src/reminders.ts` selects only `timezone` and the reminder times from `household_settings` (line 65) — it does **not** read `target_calories/protein/fiber`, so dropping those columns is safe. Task 15 Step 1's grep still runs as a backstop.
