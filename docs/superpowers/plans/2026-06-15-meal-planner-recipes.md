# Meal Planner — Recipes (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Start by creating a feature branch (e.g. `feat/recipes`) off `main`; do NOT commit directly to `main`.

**Goal:** Add recipe management to the meal-planner PWA: a `recipes` table with RLS, a manual add/edit form (name, photo, link, meal types, tags, nutrition, dynamic ingredients + steps, share toggle), and a library screen with My/Shared tabs, search, and tag filtering. This is the data + UI foundation that Plan 3 (AI Import) and Plan 4 (Plan & Today) build on.

**Architecture:** Recipes are owned by a household (`household_id`) and optionally published to a cross-household shared library (`is_shared`). RLS lets a user read their household's recipes plus any shared recipe, and write only recipes they created. Photos live in a public Supabase Storage bucket. Ingredients and steps are stored as JSONB arrays (no joins needed for v1). Pure logic (validation, input normalization) lives in `src/lib/` and is unit-tested; data access is a thin typed module; UI follows the existing Tailwind + react-router patterns from the foundation.

**Tech Stack (already in place from Plan 1):** React 19 + TS + Vite PWA, Tailwind v3 (pinned 3.4.19), `@supabase/supabase-js` 2, `zod` 4, `react-router-dom` 7, Vitest 4 + React Testing Library. The Supabase client is `src/lib/supabase.ts` (`supabase`). `useHousehold()` exposes `{ householdId }`. `current_household_id()` SQL helper exists. Brand Tailwind colors: `brand` (DEFAULT `#2e7d52`, `dark`, `soft`, `mint`), `kid`, `cheat`.

> **Conventions to match:** Supabase query results are loosely typed (no generated DB types) — cast result rows to the expected shape as done in `src/context/HouseholdProvider.tsx`. Default exports for route screens. Verify each task with `npx tsc -b` and `npm test`. The migration is a committed artifact applied manually in the Supabase dashboard (the agent cannot apply it).

---

## File Structure

```
src/
├── lib/
│   ├── recipe.ts                  # Recipe types + zod schema (pure)
│   ├── recipe.test.ts
│   ├── recipeNormalize.ts         # pure: strip blank ingredients/steps before save
│   ├── recipeNormalize.test.ts
│   └── recipes.ts                 # Supabase data access (list/create/update/delete/uploadPhoto)
├── components/
│   ├── RecipeCard.tsx             # one recipe in the library grid
│   ├── TagPicker.tsx              # multi-select chip control (tags + meal types)
│   └── DynamicList.tsx            # reusable add/remove rows (ingredients, steps)
├── routes/
│   ├── Recipes.tsx                # REPLACE placeholder: library (My/Shared, search, filter)
│   ├── RecipeForm.tsx             # add + edit form (route /recipes/new, /recipes/:id/edit)
│   ├── RecipeForm.test.tsx
│   └── RecipeDetail.tsx           # read view (/recipes/:id) with steps + link
supabase/migrations/
└── 0003_recipes.sql               # recipes table + RLS + storage bucket
```

---

## Task 1: Migration `0003_recipes.sql` (recipes table, RLS, storage bucket)

**Files:** Create `supabase/migrations/0003_recipes.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Recipes: owned by a household, optionally shared to a cross-household library
create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  photo_url text,
  link_url text,
  meal_types text[] not null default '{}',
  tags text[] not null default '{}',
  calories int,
  protein int,
  fiber int,
  nutrition_estimated boolean not null default false,
  ingredients jsonb not null default '[]'::jsonb,   -- [{ "amount": "200g", "item": "chicken" }]
  steps jsonb not null default '[]'::jsonb,          -- ["Step one", "Step two"]
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create index recipes_household_idx on recipes (household_id);
create index recipes_shared_idx on recipes (is_shared) where is_shared = true;

alter table recipes enable row level security;

-- read: your household's recipes OR any shared recipe
create policy "recipes read" on recipes for select
  using (household_id = current_household_id() or is_shared = true);

-- insert: only into your own household, as yourself
create policy "recipes insert" on recipes for insert
  with check (created_by = auth.uid() and household_id = current_household_id());

-- update/delete: only the creator
create policy "recipes update" on recipes for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "recipes delete" on recipes for delete
  using (created_by = auth.uid());

-- Storage bucket for recipe photos (public read)
insert into storage.buckets (id, name, public)
  values ('recipe-photos', 'recipe-photos', true)
  on conflict (id) do nothing;

-- authenticated users may upload to the bucket; read is public
create policy "recipe photos read" on storage.objects for select
  using (bucket_id = 'recipe-photos');
create policy "recipe photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos');
```

- [ ] **Step 2: Apply it**

Paste into Supabase dashboard → SQL Editor → Run. Verify the `recipes` table and the `recipe-photos` bucket (Storage tab) appear. If a storage policy errors because a same-named policy exists, drop it first or rename.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_recipes.sql
git commit -m "feat: recipes table, RLS, and photo storage bucket"
```

---

## Task 2: Recipe types + zod schema (pure, TDD)

**Files:** Create `src/lib/recipe.test.ts` (first), then `src/lib/recipe.ts`.

- [ ] **Step 1: Write the failing test** — `src/lib/recipe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { recipeSchema } from './recipe'

const valid = {
  name: 'Chicken Quinoa Bowl',
  photo_url: '',
  link_url: '',
  meal_types: ['lunch', 'dinner'],
  tags: ['high-protein'],
  calories: 560, protein: 41, fiber: 11,
  nutrition_estimated: false,
  ingredients: [{ amount: '200g', item: 'chicken breast' }],
  steps: ['Grill chicken', 'Toss with quinoa'],
  is_shared: false,
}

describe('recipeSchema', () => {
  it('accepts a complete valid recipe', () => {
    expect(recipeSchema.safeParse(valid).success).toBe(true)
  })
  it('rejects an empty name', () => {
    expect(recipeSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })
  it('requires at least one meal type', () => {
    expect(recipeSchema.safeParse({ ...valid, meal_types: [] }).success).toBe(false)
  })
  it('allows null nutrition values', () => {
    expect(recipeSchema.safeParse({ ...valid, calories: null, protein: null, fiber: null }).success).toBe(true)
  })
  it('rejects an invalid link url', () => {
    expect(recipeSchema.safeParse({ ...valid, link_url: 'not-a-url' }).success).toBe(false)
  })
  it('rejects a blank ingredient item', () => {
    expect(recipeSchema.safeParse({ ...valid, ingredients: [{ amount: '1', item: '' }] }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run, confirm it FAILS** — `npm test src/lib/recipe.test.ts` (module not found).

- [ ] **Step 3: Implement** — `src/lib/recipe.ts`:

```ts
import { z } from 'zod'

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'kid'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export const RECIPE_TAGS = ['healthy', 'high-protein', 'kid-friendly', 'cheat', 'veg', 'fiber-rich'] as const

const optionalUrl = z.union([z.literal(''), z.string().url('Enter a valid URL')])

export const recipeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  photo_url: optionalUrl,
  link_url: optionalUrl,
  meal_types: z.array(z.enum(MEAL_TYPES)).min(1, 'Pick at least one meal type'),
  tags: z.array(z.string()),
  calories: z.number().int().nonnegative().nullable(),
  protein: z.number().int().nonnegative().nullable(),
  fiber: z.number().int().nonnegative().nullable(),
  nutrition_estimated: z.boolean(),
  ingredients: z.array(z.object({ amount: z.string(), item: z.string().trim().min(1, 'Ingredient required') })),
  steps: z.array(z.string().trim().min(1, 'Step cannot be empty')),
  is_shared: z.boolean(),
})

export type RecipeInput = z.infer<typeof recipeSchema>

export interface Recipe extends RecipeInput {
  id: string
  household_id: string
  created_by: string
  created_at: string
}
```

- [ ] **Step 4: Run, confirm it PASSES** (6 tests).
- [ ] **Step 5: Commit** — `git commit -m "feat: recipe types and validation schema"`.

---

## Task 3: Input normalization helper (pure, TDD)

**Files:** Create `src/lib/recipeNormalize.test.ts` (first), then `src/lib/recipeNormalize.ts`. Strips blank ingredient/step rows the user added but didn't fill, before validation/save.

- [ ] **Step 1: Failing test** — `src/lib/recipeNormalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeRecipeInput } from './recipeNormalize'

describe('normalizeRecipeInput', () => {
  it('drops blank ingredient rows (no item) and blank steps', () => {
    const out = normalizeRecipeInput({
      name: '  Dal  ',
      photo_url: '', link_url: '',
      meal_types: ['dinner'], tags: [],
      calories: null, protein: null, fiber: null, nutrition_estimated: false,
      ingredients: [{ amount: '1 cup', item: 'lentils' }, { amount: '', item: '' }, { amount: '2', item: '  ' }],
      steps: ['Boil', '', '   '],
      is_shared: false,
    })
    expect(out.ingredients).toEqual([{ amount: '1 cup', item: 'lentils' }])
    expect(out.steps).toEqual(['Boil'])
    expect(out.name).toBe('Dal')
  })
})
```

- [ ] **Step 2: Run, confirm FAILS.**
- [ ] **Step 3: Implement** — `src/lib/recipeNormalize.ts`:

```ts
import type { RecipeInput } from './recipe'

export function normalizeRecipeInput(input: RecipeInput): RecipeInput {
  return {
    ...input,
    name: input.name.trim(),
    ingredients: input.ingredients
      .map((i) => ({ amount: i.amount.trim(), item: i.item.trim() }))
      .filter((i) => i.item.length > 0),
    steps: input.steps.map((s) => s.trim()).filter((s) => s.length > 0),
  }
}
```

- [ ] **Step 4: Run, confirm PASSES.**
- [ ] **Step 5: Commit** — `git commit -m "feat: recipe input normalization"`.

---

## Task 4: Recipe data-access module

**Files:** Create `src/lib/recipes.ts`. Thin typed wrappers over Supabase. Verify with `npx tsc -b`.

- [ ] **Step 1: Implement** — `src/lib/recipes.ts`:

```ts
import { supabase } from './supabase'
import type { Recipe, RecipeInput } from './recipe'

export async function listMyRecipes(householdId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes').select('*').eq('household_id', householdId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function listSharedRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes').select('*').eq('is_shared', true).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase.from('recipes').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Recipe) ?? null
}

export async function createRecipe(householdId: string, input: RecipeInput): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes').insert({ ...input, household_id: householdId }).select('*').single()
  if (error) throw error
  return data as Recipe
}

export async function updateRecipe(id: string, input: RecipeInput): Promise<Recipe> {
  const { data, error } = await supabase.from('recipes').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
}

export async function uploadRecipePhoto(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('recipe-photos').upload(path, file)
  if (error) throw error
  return supabase.storage.from('recipe-photos').getPublicUrl(path).data.publicUrl
}
```

- [ ] **Step 2: Typecheck** — `npx tsc -b` (clean).
- [ ] **Step 3: Commit** — `git commit -m "feat: recipe data-access module"`.

---

## Task 5: Reusable `DynamicList` + `TagPicker` components

**Files:** Create `src/components/DynamicList.tsx`, `src/components/TagPicker.tsx`.

- [ ] **Step 1: `DynamicList.tsx`** — add/remove text rows (used for steps; ingredients use a 2-field variant inline in the form). Generic over a render function:

```tsx
interface DynamicListProps {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  addLabel: string
}

export default function DynamicList({ label, items, onChange, placeholder, addLabel }: DynamicListProps) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
      <div className="space-y-2 mt-1">
        {items.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input className="flex-1 border rounded-xl p-3" aria-label={`${label} ${i + 1}`}
              value={val} placeholder={placeholder}
              onChange={(e) => onChange(items.map((v, idx) => (idx === i ? e.target.value : v)))} />
            <button type="button" aria-label={`Remove ${label} ${i + 1}`} className="px-3 text-red-500"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-2 text-brand font-semibold text-sm"
        onClick={() => onChange([...items, ''])}>{addLabel}</button>
    </div>
  )
}
```

- [ ] **Step 2: `TagPicker.tsx`** — toggle chips from a fixed option list (used for meal types and tags):

```tsx
interface TagPickerProps {
  label: string
  options: readonly string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function TagPicker({ label, options, selected, onChange }: TagPickerProps) {
  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  }
  return (
    <div>
      <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
      <div className="flex gap-2 flex-wrap mt-1">
        {options.map((opt) => (
          <button type="button" key={opt} aria-pressed={selected.includes(opt)} onClick={() => toggle(opt)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
              selected.includes(opt) ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-500'}`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck** — `npx tsc -b`.
- [ ] **Step 4: Commit** — `git commit -m "feat: DynamicList and TagPicker components"`.

---

## Task 6: RecipeForm (add/edit) with component test

**Files:** Create `src/routes/RecipeForm.tsx`, `src/routes/RecipeForm.test.tsx`. Used at `/recipes/new` and `/recipes/:id/edit`.

Behavior: loads existing recipe if `:id` present (edit) else blank (new). Fields: photo upload (calls `uploadRecipePhoto`, shows preview), name, `TagPicker` for meal types (options `MEAL_TYPES`) and tags (options `RECIPE_TAGS`), three nutrition number inputs + an "≈ estimated" checkbox, dynamic ingredients (two inputs per row: amount + item, with add/remove), `DynamicList` for steps, optional link url, a "Share to friends' library" toggle, Save (validates with `recipeSchema` after `normalizeRecipeInput`, calls `createRecipe`/`updateRecipe`, navigates to `/recipes/:id`). Use `useHousehold()` for `householdId`. Show first zod error message.

- [ ] **Step 1: Implement `RecipeForm.tsx`** following the foundation's `Onboarding.tsx` patterns (controlled state, dynamic rows keyed by stable id, error display, `busy` flag). Ingredients state: `{ id: string; amount: string; item: string }[]`; on save map to `{ amount, item }`. Steps use `DynamicList`. Meal types & tags use `TagPicker`. On mount, if `useParams().id` exists, call `getRecipe(id)` and populate state (show "Loading…" while fetching). Validate: build the `RecipeInput`, run `normalizeRecipeInput`, then `recipeSchema.safeParse`; on failure `setError(issues[0].message)`. On success create/update then `nav(\`/recipes/${saved.id}\`)`.

- [ ] **Step 2: Write `RecipeForm.test.tsx`** (mock `../lib/recipes`, `../context/HouseholdProvider`, and `react-router-dom`'s `useParams`/`useNavigate`). Cover: renders blank for new; "+ Add ingredient" adds an ingredient row (assert `aria-label="Ingredient 1 amount"` / `"Ingredient 1 item"` appear); submitting with an empty name shows "Name is required"; submitting valid data calls `createRecipe` once with normalized input. Example for the dynamic-row assertion:

```tsx
it('adds an ingredient row', async () => {
  renderForm()
  await userEvent.click(screen.getByText('+ Add ingredient'))
  expect(screen.getByLabelText('Ingredient 1 amount')).toBeInTheDocument()
  expect(screen.getByLabelText('Ingredient 1 item')).toBeInTheDocument()
})
```

(Give each ingredient row inputs `aria-label={\`Ingredient ${i+1} amount\`}` and `aria-label={\`Ingredient ${i+1} item\`}` so the test can target them.)

- [ ] **Step 3: Run** `npm test src/routes/RecipeForm.test.tsx` — confirm all pass.
- [ ] **Step 4: Typecheck + commit** — `npx tsc -b`; `git commit -m "feat: recipe add/edit form"`.

---

## Task 7: RecipeCard + Recipes library screen

**Files:** Create `src/components/RecipeCard.tsx`; REPLACE `src/routes/Recipes.tsx` (currently a placeholder).

- [ ] **Step 1: `RecipeCard.tsx`** — photo (or emoji fallback), name, `caloriescal · {protein}g protein · {fiber}g fiber` line (omit missing values), tag chips, a "↗ Shared" badge when `is_shared`. Wrap in a `Link` to `/recipes/:id`.

- [ ] **Step 2: `Recipes.tsx`** — header "Recipes" + a "+ Add" button (`Link` to `/recipes/new`); a segmented control **My Recipes / Shared Library**; a search `<input>` (filter by name, case-insensitive) and a `TagPicker`-style tag filter; a responsive grid of `RecipeCard`. On mount and tab change, load via `listMyRecipes(householdId)` / `listSharedRecipes()` (use `useHousehold()`), keep `loading`/`error` state. Apply search + tag filters client-side. Empty state: "No recipes yet — add your first." Match Tailwind brand styling; keep the bottom-tab layout (this renders inside `AppShell`).

- [ ] **Step 3: Typecheck + (optional) a light render test.** `npx tsc -b`.
- [ ] **Step 4: Commit** — `git commit -m "feat: recipe library screen and card"`.

---

## Task 8: RecipeDetail (read view)

**Files:** Create `src/routes/RecipeDetail.tsx` (route `/recipes/:id`).

- [ ] **Step 1: Implement** — load via `getRecipe(id)` (show "Loading…", and "Not found" if null). Show photo, name, nutrition line (with "≈ estimated" note when `nutrition_estimated`), tags, ingredients list, numbered steps, and a "▶ Watch video / open blog" button when `link_url` is set. If the current user is the creator (`recipe.created_by === session.user.id`, via `useAuth()`), show **Edit** (`Link` to `/recipes/:id/edit`) and **Delete** (calls `deleteRecipe`, then `nav('/recipes')`) buttons. A back link to `/recipes`.

- [ ] **Step 2: Typecheck + commit** — `npx tsc -b`; `git commit -m "feat: recipe detail view"`.

---

## Task 9: Wire recipe routes

**Files:** Modify `src/App.tsx`.

- [ ] **Step 1:** Inside the `AppShell` route group (the one with the tab routes), add child routes under `recipes`:

```tsx
import RecipeForm from './routes/RecipeForm'
import RecipeDetail from './routes/RecipeDetail'
// ...
<Route path="recipes" element={<Recipes />} />
<Route path="recipes/new" element={<RecipeForm />} />
<Route path="recipes/:id" element={<RecipeDetail />} />
<Route path="recipes/:id/edit" element={<RecipeForm />} />
```

Keep the existing `index`/`plan`/`shop`/`pantry` routes. (All recipe routes render inside `AppShell`, so the bottom tab bar stays visible.)

- [ ] **Step 2: Verify** — `npx tsc -b`; `npm test` (all prior + new pass); `npm run build` (emits `dist/sw.js`).
- [ ] **Step 3: Commit** — `git commit -m "feat: wire recipe routes"`.

---

## Task 10: Verify, manual E2E, and finish

- [ ] **Step 1: Full check** — `npm test` (all green), `npx tsc -b` (clean), `npm run build` (sw.js emitted).

- [ ] **Step 2: Manual E2E** (dev server + signed-in user with a household; migration 0003 applied):
  1. Recipes tab → "+ Add" → fill name, pick meal types + tags, add 2 ingredients + 2 steps, set nutrition, optionally upload a photo and add a link → Save → lands on the detail view showing everything.
  2. Recipes tab → the new recipe appears under **My Recipes**; search by name filters it; a tag filter narrows results.
  3. Toggle the recipe's "Share to friends' library" (edit → save) → it appears under **Shared Library**.
  4. Edit → change a field → save → detail reflects it. Delete → returns to library, recipe gone.
  5. Confirm the bottom tab bar stays visible throughout.

- [ ] **Step 3: Finish** — use superpowers:finishing-a-development-branch to merge `feat/recipes` → `main` (or open a PR) after verification.

---

## Self-Review (run after writing the plan; already applied)

- **Spec coverage:** recipe model + nutrition (cal/protein/fiber + estimated flag) ✅ (T1–T2); photo + link ✅ (T1, T4, T6); meal types + tags ✅ (T2, T5, T6); ingredients + steps ✅ (T2, T6); My/Shared library + search/filter ✅ (T7); add/edit/delete ✅ (T6, T8); "add to menu" is deferred to Plan 4 (Plan & Today). AI import is Plan 3.
- **Type consistency:** `RecipeInput`/`Recipe` from `recipe.ts` used across `recipes.ts`, `RecipeForm`, `RecipeDetail`; `MEAL_TYPES`/`RECIPE_TAGS` reused in `TagPicker` usage; `normalizeRecipeInput` applied before `recipeSchema` parse in the form.
- **RLS consistency:** `recipes` policies use `current_household_id()` (defined in 0001) and the `is_shared` read path; insert checks `household_id = current_household_id()` matching how the form passes `useHousehold().householdId`.
