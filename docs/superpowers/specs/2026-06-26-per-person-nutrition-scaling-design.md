# Per-Person Recipes, Family-Count Scaling & Full Nutrition

**Date:** 2026-06-26
**Status:** Approved (brainstorm) — ready for implementation plan

## Summary

Two intertwined changes:

1. **Per-person baseline + family-count scaling.** Every recipe stores nutrition and
   ingredient amounts for **exactly one person**. The household's family count is applied
   at display time to scale **ingredient quantities** (Recipe ingredients stepper and Shop).
   Nutrition is never inflated by family count.

2. **Full nutrition with actual-vs-need comparison.** Expand from 3 nutrients
   (calories/protein/fiber) to a **17-nutrient** set across Macros / Vitamins / Minerals.
   Each nutrient has an icon and a kid-friendly "why it matters" line. The Recipe page and
   Home page both **compare actual numbers against the daily need per person**, with separate
   **Adult** and **Kid** reference targets that are fully editable.

## Motivation

A household may be 1 person or 4+. Storing recipe data per person lets quantities scale
dynamically to the right number of mouths across Preparations (Recipe detail), Shop, and the
basket. Expanding nutrition turns the app into something that teaches *why* each nutrient
matters — important for planning kids' food, where micronutrients drive growth.

## Decisions (from brainstorming)

- **Scaling basis:** family meals (breakfast/lunch/dinner) scale by `adults + kids.length`;
  the kid's school box (kid-lunch, kid-snack) scales by `kids.length`.
- **Adults source:** explicit `adults` number in Onboarding/Settings (default 2).
- **Ingredient scaling:** parse the leading number in the free-text amount and multiply
  (`"200 g"` ×3 → `"600 g"`, `"1/2 tsp"` ×3 → `"1 1/2 tsp"`). Non-numeric amounts unchanged.
- **Per-person baseline:** AI import normalizes nutrition **and** ingredient amounts to one
  serving; manual entry is per person. Existing recipes will be **deleted** (clean cutover).
- **Recipe detail scaling UI:** a "Serves" stepper (default 1) scales the **ingredient list**.
  The nutrition section always shows **one serving** vs one person's need.
- **Nutrition vs family count:** family count scales **ingredient quantities only**, never
  nutrition. Nutrition comparisons are per person.
- **Nutrient set:** 17 nutrients (approved via visual mockup), grouped Macros / Vitamins /
  Minerals, each with icon + "why it matters" microcopy.
- **Targets:** built-in researched defaults for **Adult** and **Kid**, **fully editable** in
  Settings. AI/research provides correct defaults; user overrides any mistake manually.
- **Home rollups:** two daily rollups — "You" (family meals) vs Adult need, and "Kid's day"
  (school box) vs Kid need.

## Architecture

### Canonical nutrient registry — `src/lib/nutrients.ts`

Single source of truth consumed by recipes, targets, the AI prompt, and all UI. One entry
per nutrient:

```ts
export interface NutrientDef {
  key: string            // stable id, e.g. 'protein'
  label: string          // 'Protein'
  unit: string           // 'g', 'mg', 'µg', 'kcal', ''
  group: 'macro' | 'vitamin' | 'mineral'
  icon: IconName         // hand-drawn icon key
  why: string            // kid-friendly: 'Builds muscles'
  adultRda: number       // seed default daily need (editable)
  kidRda: number         // seed default daily need, school-age (editable)
  headline?: boolean     // shown in compact strips (calories/protein/fiber)
}
```

**The 17 nutrients** (seed RDA defaults — standard dietary references; verify during
implementation, all editable in-app):

| key | label | unit | group | why | adultRda | kidRda |
|---|---|---|---|---|---|---|
| calories | Calories | kcal | macro | Fuel for play & growth | 2000 | 1400 |
| protein | Protein | g | macro | Builds muscles | 90 | 19 |
| carbs | Carbs | g | macro | Quick energy for the brain | 275 | 130 |
| healthy_fats | Healthy fats | g | macro | Brain growth & vitamin uptake | 70 | 50 |
| fiber | Fiber | g | macro | Happy tummy & digestion | 28 | 25 |
| vitamin_a | Vitamin A | µg | vitamin | Sharp eyesight | 900 | 400 |
| vitamin_c | Vitamin C | mg | vitamin | Immunity & healing | 90 | 25 |
| vitamin_d | Vitamin D | µg | vitamin | Strong bones (with calcium) | 20 | 15 |
| folate | Folate | µg | vitamin | Makes new cells (growth) | 400 | 200 |
| choline | Choline | mg | vitamin | Memory & brain development | 550 | 250 |
| vitamin_b12 | Vitamin B12 | µg | vitamin | Energy & healthy nerves | 2.4 | 1.2 |
| iron | Iron | mg | mineral | Healthy blood & focus | 18 | 10 |
| calcium | Calcium | mg | mineral | Strong bones & teeth | 1300 | 1000 |
| potassium | Potassium | mg | mineral | Heart & muscles | 4700 | 2300 |
| zinc | Zinc | mg | mineral | Immunity & growth | 11 | 5 |
| magnesium | Magnesium | mg | mineral | Muscles & calm sleep | 420 | 130 |
| omega_3 | Omega-3 | g | mineral* | Brain & eye development | 1.6 | 0.9 |

\* Omega-3 is a fat; grouped at the end of Minerals in the UI for visual balance, or its own
"Fats" sub-group — final placement is a UI detail, values are what matter.

Headline nutrients (compact strips): `calories`, `protein`, `fiber`.

### Data model — migration `0009`

- **recipes:** drop `calories`, `protein`, `fiber`; add `nutrients jsonb not null default '{}'`
  — a per-person map `{ [key]: number | null }`. Keep `nutrition_estimated boolean`.
- **household_settings:** add
  - `adults int not null default 2`
  - `targets_adult jsonb not null` — seeded from registry `adultRda`
  - `targets_kid jsonb not null` — seeded from registry `kidRda`
- Ingredient amounts remain free-text strings (no schema change).
- Existing recipe rows are deleted before/with the migration (clean cutover; no backfill).

### Counts & scaling — `src/lib/scale.ts`

```ts
scaleAmount(amount: string, factor: number): string
// parses leading int / decimal / 'a/b' / 'a b/c'; multiplies; reformats
// (nice fractions for common cases, else rounded decimal); factor 1 → unchanged;
// no leading number ('a pinch', '') → unchanged.

countForSlot(slot: PickSlot | PoolSlot, familyCount: number, kidCount: number): number
// kid / kid-lunch / kid-snack → kidCount; else familyCount.
```

`HouseholdProvider` exposes `adults`, derived `familyCount = adults + kids.length`,
`kidCount = kids.length`, plus `targetsAdult` / `targetsKid` maps.

### Nutrition rollup — `src/lib/nutrition.ts`

```ts
sumNutrients(recipes: {nutrients: NutrientMap}[]): NutrientMap   // per-person totals
// Home: sum family-meal picks → compare to targetsAdult;
//       sum school-box picks  → compare to targetsKid.
// Recipe page: single recipe's nutrients → compare to targetsAdult or targetsKid (toggle).
```

## UI

### Recipe Detail (Preparations)
- **Nutrition panel** (approved mockup): 17 nutrients grouped Macros / Vitamins / Minerals,
  each tile = icon + per-person value + name + "why it matters" + a small bar/percent of
  **daily need**. **Adult / Kid toggle** switches the need denominator. AI-estimated marker.
- **Serves stepper** (default 1) on the **ingredient list**, scaling amounts via `scaleAmount`.
  Nutrition section stays per person.

### Home (Today)
- Two rollups based on the day's selected meals:
  - **"You"** — family meals (breakfast/lunch/dinner) totals vs **Adult** need.
  - **"Kid's day"** — school box (kid-lunch, kid-snack) totals vs **Kid** need (only when kids).
- Headline tiles (Calories/Protein/Fiber) shown prominently; full 17-set expandable.
- `NutritionStrip` generalized to render any nutrient subset against a target map.

### Shop (= basket / market list)
- Each ingredient scales by **its slot's count** (`countForSlot`): kid recipes ×`kidCount`,
  family recipes ×`familyCount`. `buildShoppingRows` takes recipe **occurrences carrying their
  slot** (stop dropping `slot` in `Shop.tsx`) and applies `scaleAmount` per row.
- Header note: "Quantities for N".

### Settings & Onboarding
- **Adults** count input (default 2).
- **Editable Adult & Kid targets** for all 17 nutrients, grouped, pre-filled with seed
  defaults; reset-to-default affordance.

### AI import — `server/src/prompt.ts`
- Output **per-one-person** values for all 17 nutrient keys + normalize ingredient amounts to
  one serving (divide source amounts by source servings). `nutrition_estimated=true` when
  estimated. JSON schema updated to the registry keys; nullable per nutrient.

## Component boundaries

- `nutrients.ts` — registry (data only; no React).
- `scale.ts` — pure amount/count math; unit-tested in isolation.
- `nutrition.ts` — pure rollup/compare math; unit-tested in isolation.
- `NutritionPanel` (Recipe) and `NutritionStrip` (Home) — presentational, driven by a
  `{ values, targets }` pair; no data fetching.
- `HouseholdProvider` — owns counts + targets; the only place that knows household shape.

## Testing

- `scaleAmount`: integers, decimals, `1/2`, `1 1/2`, no-number, empty, factor 1, factor 0.
- `countForSlot`: kid slots vs family slots.
- `sumNutrients` / compare: per-person totals, adult vs kid denominators, missing/null values.
- `buildShoppingRows`: scaled quantities per slot; staple/pantry logic unchanged.
- Registry integrity: every nutrient has key/label/unit/group/icon/why and both RDAs.
- Light component checks: Serves stepper scales ingredients (not nutrition); "You" vs
  "Kid's day" rollups render with correct denominators.

## Out of scope / deferred

- Per-kid-age RDA bands (single representative school-age Kid set for now).
- Combining mixed units intelligently in Shop (e.g. "1 cup + 2 tbsp"); we scale each line.
- A runtime "AI research targets" button — defaults are shipped researched constants, editable.

## Affected files (indicative)

- New: `src/lib/nutrients.ts`, `src/lib/scale.ts`, `src/lib/nutrition.ts`,
  `supabase/migrations/0009_*.sql`, `src/components/NutritionPanel.tsx`.
- Changed: `src/lib/recipe.ts` (schema → `nutrients` map), `src/lib/householdDefaults.ts`,
  `src/lib/onboardingSchema.ts`, `src/context/HouseholdProvider.tsx`, `src/routes/Today.tsx`,
  `src/routes/RecipeDetail.tsx`, `src/routes/RecipeForm.tsx`, `src/routes/Shop.tsx`,
  `src/routes/Settings.tsx`, `src/routes/Onboarding.tsx`, `src/lib/pantry.ts`
  (`buildShoppingRows`), `src/components/NutritionStrip.tsx`, `src/components/MealCard.tsx`,
  `src/components/RecipeCard.tsx`, `server/src/prompt.ts`.
