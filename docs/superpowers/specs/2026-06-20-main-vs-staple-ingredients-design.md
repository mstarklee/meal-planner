# Main vs. Staple Ingredients — Design

**Date:** 2026-06-20
**Status:** Approved (design), pending implementation plan

## Problem

Users already know how to cook the recipes they save — they don't need every
ingredient tracked. Simple, always-on-hand items (salt, sugar, cumin, turmeric,
ginger-garlic paste, oil…) currently flow into the **Shop** list as things to
buy, which is noise. Users want to record **all** ingredients on a recipe (so the
recipe and steps are complete), but have only the **main** ingredients
(paneer, egg, chicken, vegetables…) reach the shopping list and pantry tracking.

## Goal

When adding or editing a recipe, capture every ingredient. Let the user classify
each ingredient as **Main** or **Staple (Always have at home)**. Only **Main**
ingredients appear in Shop. Staple ingredients are fully hidden from Shop.

## Decisions (settled during brainstorming)

1. **Hybrid scope.** A household-level staples list provides a smart *default*
   for each ingredient, but the user can override any ingredient on a specific
   recipe. The recipe's own per-ingredient flag is the source of truth once saved.
2. **Seed + grows.** The household staples list is pre-seeded with common staples
   at household creation. Whenever a user marks an ingredient as "Staple" that
   isn't already in the list, it is added to the list. Marking an ingredient back
   to "Main" does **not** remove it from the list (removal happens in Settings).
3. **Flag lives on the recipe ingredient.** Each ingredient becomes
   `{ amount, item, staple }`. The staples list only sets the default at
   add/import time. (Rejected alternative: deriving staple-ness purely at shop
   time — it cannot support per-recipe overrides.)
4. **Toggle wording:** "Main" / "Staple (Always have at home)".
5. **Shop hides staples entirely** (no collapsed section).

## Data model

### New table `household_staples`

```sql
create table household_staples (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index household_staples_household_name_idx
  on household_staples (household_id, lower(name));
create index household_staples_household_idx on household_staples (household_id);
```

RLS policies mirror `pantry_items` (read/insert/update/delete scoped to
`household_id = current_household_id()`).

**Seeding.** Households are created by the `create_household_with_setup`
SECURITY DEFINER function (`supabase/migrations/0002_security_and_onboarding.sql`).
The new migration uses `create or replace function` to extend it with a default
staples insert against the new `v_household_id` (idempotent via
`on conflict do nothing`). Default list: `salt, sugar, oil, ghee, cumin,
mustard seeds, turmeric, chili powder, coriander powder, garam masala,
ginger-garlic paste, black pepper, water`. (There is no existing pantry-seeding
path to mirror — `pantry_items` are user-added today.)

### Recipe ingredient shape

`ingredients` jsonb element gains an optional `staple` boolean:

```
{ "amount": "200 g", "item": "paneer", "staple": false }
```

- **Backward compatible.** Existing recipe rows have ingredients without
  `staple`. A missing `staple` is treated as *unknown* and resolved at read time
  by matching `item` against the household staples list. No migration of existing
  recipe rows is required.
- `recipeSchema` (`src/lib/recipe.ts`) ingredient object adds
  `staple: z.boolean()` with a default applied during normalization (see below).

## Behavior

### Recipe form (`src/routes/RecipeForm.tsx`) — add / edit

- Each ingredient row gains a **Main / Staple** toggle alongside amount + item.
- **Default per new row** is computed from the household staples list: if `item`
  matches a staple (case-insensitive, same matching helper used by Shop) the row
  defaults to **Staple**; otherwise **Main**. The default re-evaluates as the
  user types the item name (until they manually set the toggle, after which their
  choice sticks).
- On **save**: any ingredient marked **Staple** whose `item` is not already in
  `household_staples` is added to the list (the "grows" behavior). This is a
  best-effort side effect; a failure to add a staple must not block saving the
  recipe.
- Editing a recipe loads each ingredient's stored `staple` flag; rows missing a
  flag fall back to the staples-list default.

### AI import (`src/routes/RecipeImport.tsx` / draft prefill)

- Uses the same staples-list default logic after extraction. **No AI prompt
  change** in this iteration — the extraction schema is unchanged; the `staple`
  default is applied client-side when the draft populates the form.

### Shop (`src/lib/pantry.ts` `buildShoppingRows`)

- Filter out staple ingredients before building rows. An ingredient is a staple
  if `ing.staple === true`, **or** (`ing.staple` is undefined **and** `item`
  matches the household staples list). Otherwise it is a main ingredient.
- `buildShoppingRows` gains access to the household staples list (passed in, like
  `pantryItems`) to resolve the undefined-flag fallback. `Shop.tsx` loads the
  staples list alongside pantry items and checks.
- Pantry "good" matching still applies on top of main ingredients exactly as today.

### Settings (`src/routes/Settings.tsx`)

- New **"Pantry staples"** editor: list current staples, add a new staple, remove
  a staple. Removing a staple means future recipes default that item to **Main**
  again (already-saved recipes keep their stored flag).

### Pantry (`src/routes/Pantry.tsx`)

- Unchanged. Good/low/out tracking continues to work on whatever main ingredients
  the user chooses to track. Staples are simply never surfaced into Shop.

## Affected files

- **New:** `supabase/migrations/0008_household_staples.sql` (table, RLS, seed function/insert).
- **New:** `src/lib/staples.ts` (types + `getStaples`, `addStaple`, `removeStaple`, `isStaple` matcher).
- `src/lib/recipe.ts` — ingredient schema adds `staple`.
- `src/lib/recipeNormalize.ts` — default/normalize `staple` per ingredient.
- `src/routes/RecipeForm.tsx` — per-row Main/Staple toggle, default logic, grow-list on save.
- `src/routes/RecipeImport.tsx` (or draft path) — apply staple defaults to imported draft.
- `src/lib/pantry.ts` — `buildShoppingRows` filters staples (with list fallback).
- `src/routes/Shop.tsx` — load staples list, pass into `buildShoppingRows`.
- `src/routes/Settings.tsx` — staples editor.
- `create_household_with_setup` (extended in the new migration) — seed default staples.

## Out of scope / YAGNI

- AI-driven staple classification in the extraction prompt (default-by-list is
  enough for now).
- Per-member or per-cuisine staple lists.
- Migrating existing recipe rows to backfill `staple` flags (read-time fallback
  covers them).
- A collapsed "staples" section in Shop (staples are fully hidden).

## Testing

- `pantry.test` (new/extended): `buildShoppingRows` hides explicit staples; hides
  undefined-flag ingredients that match the staples list; keeps main ingredients;
  pantry "good" still applies to mains.
- `recipe`/`recipeNormalize` tests: ingredient schema accepts `staple`;
  normalization applies the correct default.
- `staples.ts` matcher tests (case-insensitive match parity with pantry matcher).
- RecipeForm test: toggling Main/Staple persists; staple default derives from list.
