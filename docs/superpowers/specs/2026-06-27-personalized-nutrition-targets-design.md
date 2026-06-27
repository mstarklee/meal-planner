# Personalized Per-Member Nutrition Targets

**Date:** 2026-06-27
**Status:** Approved (brainstorm) — ready for implementation plan
**Branch:** `feat/personalized-nutrition-targets` (off `feat/per-person-nutrition`)
**Builds on:** `2026-06-26-per-person-nutrition-scaling-design.md` (17-nutrient model, per-person recipes)

## Summary

Replace the two flat reference targets (`targets_adult` / `targets_kid`, generic RDA values
like "90 g protein for every adult") with **per-member personalized targets** computed from
each family member's real attributes. Each member enters sex, approximate age, weight, and an
activity/goal level; a deterministic library computes that member's 17 nutrient targets. The
household's needs roll up to a **family total** (headline) with each member's targets
**viewable underneath**.

This directly answers the user's complaint: the current model gives "average random numbers"
(90 g protein regardless of body size). The new model gives the *exact* recommendation for a
given person — e.g. a 60 kg sedentary adult needs ~48 g protein, not 90 g.

## Motivation

A family is heterogeneous: a 70 kg strength-training dad, a 55 kg moderately-active mum, and
an 8-year-old child each need very different amounts of protein, calories, iron, and calcium.
Members may also follow different diets/goals. A single "adult" target can't represent any of
them. Targets must be **derived from the person**, and **reproducible** (no AI guesswork in the
numbers themselves).

## Decisions (from brainstorming)

- **Inputs per member:** sex, age (approximate ok), weight (kg), activity/goal level.
- **Precision:** activity level only — **no height** (calories use a weight-based estimate),
  **no separate goal field** (goal is folded into the activity/goal picker).
- **Display:** **family total is the headline**; each member's targets are expandable beneath.
  Recipes & Home still compare per-person; the member rollup provides the family number.
- **Kid classification:** **auto from age** — a member under 18 is a "kid" for the school-box
  scaling and the kid rollup. No manual toggle.
- **Override:** targets are **computed and recalculated live** when a profile changes; a
  per-member sparse **override map** lets the user hand-edit any nutrient. Cleared override =
  back to computed.
- **Engine:** **deterministic formula library (Approach A)**. No network, fully reproducible.
  AI is *advisory only* — it can pre-select the activity/goal picker for unsure users; it never
  produces the target numbers.
- **Protein factors** map to the user-supplied table (see below).
- **Fat loss** keeps calories at **maintenance** (high protein only) — no auto calorie deficit
  (avoids medical-advice territory).
- **Pregnancy/lactation:** out of scope for this iteration (noted as a future extension).

## Activity / goal levels → protein & calories

The activity/goal picker is **per member** (different members can choose differently) and maps
to a protein factor (from the user's table) and a calorie activity factor:

| Level | Protein (g/kg) | Calorie activity factor |
|---|---|---|
| Sedentary | 0.8 | 1.2 |
| Moderately active | 1.1 (range 1.0–1.2) | 1.375 |
| Regular strength training | 1.8 (range 1.6–2.2) | 1.55 |
| Fat loss, preserve muscle | 2.0 (range 1.6–2.4) | 1.45 |

Representative single values are used (editable via override). **The picker applies to adults
only.** Members under 18 do not see it — their protein and micronutrients come from pediatric
age-bands (growth-driven), and their calories from age/sex energy bands.

## Architecture

### Calculation engine — `src/lib/nutritionTargets.ts` (new, pure)

A single pure function with no I/O, unit-tested per [[no-tdd-implement-directly]] (direct impl +
unit tests on the pure lib):

```ts
export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'moderate' | 'strength' | 'fat_loss'

export interface MemberProfile {
  id: string
  name: string | null
  sex: Sex
  age: number          // years (approximate)
  weightKg: number
  activity: ActivityLevel  // ignored for members under 18
}

// Returns the full 17-nutrient target map for one member (before overrides).
export function computeTargets(m: MemberProfile): NutrientMap

// Applies a sparse override map on top of computed targets.
export function effectiveTargets(m: MemberProfile, overrides: NutrientMap): NutrientMap

export function isKid(m: MemberProfile): boolean   // age < 18
```

**Computation rules:**

- **Protein** = `weightKg × gPerKg`.
  - Adults: `gPerKg` from the activity/goal table.
  - Kids/teens: pediatric DRI g/kg by age band (e.g. 1–3y ≈ 1.05, 4–13y ≈ 0.95, 14–18y ≈ 0.85).
- **Calories**:
  - Adults: weight-based maintenance estimate × activity factor (kcal/kg per activity, no
    height). Fat-loss uses the strength-level intent but stays at maintenance calories.
  - Kids/teens: age/sex estimated-energy-requirement bands.
- **Carbs / fats / fiber** = derived from calories: carbs ≈ 50% kcal / 4; fat ≈ 30% kcal / 9;
  fiber = 14 g per 1000 kcal.
- **12 micronutrients** (vit A, C, D, folate, choline, B12, iron, calcium, potassium, zinc,
  magnesium, omega-3) = looked up from a built-in **age/sex RDA band table**:
  toddler 1–3, child 4–8, child 9–13, teen 14–18 (M/F), adult 19–50 (M/F), adult 51+ (M/F).

The RDA band table and protein/calorie constants live in this module (or a sibling data file),
sourced from standard dietary references. `src/lib/nutrients.ts` keeps the canonical nutrient
registry (keys, units, labels, icons, "why it matters"); the static `adultRda` / `kidRda`
fields there are superseded by `computeTargets` and will be removed once nothing reads them.

### Rollups — `src/lib/nutritionTargets.ts`

```ts
export function familyTargets(members: MemberWithOverrides[]): NutrientMap   // sum of all
export function kidTargets(members: MemberWithOverrides[]): NutrientMap      // sum of under-18s
```

- **Home:** the day's consumption compares against `familyTargets` (and `kidTargets` for the
  school-box rollup). Each member's `effectiveTargets` is expandable underneath.
- **Recipe detail:** one serving = one person, so "% of daily need" compares against a
  **selectable member** (default: first adult). A small member selector drives the percentages.

### Data model — new table `household_members`

```sql
create table household_members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text,
  sex           text not null check (sex in ('male','female')),
  age           int  not null check (age >= 0 and age < 130),
  weight_kg     numeric not null check (weight_kg > 0),
  activity_level text not null check (activity_level in
                  ('sedentary','moderate','strength','fat_loss')),
  overrides     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
```

- RLS mirrors existing household-scoped tables (member of household can CRUD their rows).
- **Dropped** from `household_settings`: `targets_adult`, `targets_kid`, `adults`. The member
  list is the single source of truth; adult/kid counts derive from member ages at read time.
- Targets are **never stored** (computed at read time); only the sparse `overrides` per member.

### Migration `0010_household_members.sql`

1. Create `household_members` + RLS policies.
2. Drop `targets_adult`, `targets_kid`, `adults` from `household_settings`.
3. Re-sign onboarding RPC `create_household_with_setup` to accept a member list (array of
   member rows) instead of `p_adults` / target params, and insert into `household_members`.
   Preserve the default-staples seeding that 0009 restored.

(0010 sits on top of 0009, which still requires manual apply in Supabase.)

### Onboarding & Settings

- **Onboarding:** the "adults count + targets" step becomes an **"Add family members"** step —
  add/remove member cards, each capturing name/sex/age/weight/activity. At least one member
  required. Schema in `src/lib/onboardingSchema.ts` updated; tests updated.
- **Settings:** the nutrition section becomes a **member manager** (add/edit/remove members)
  plus a per-member **override editor** (computed value shown, optional manual edit, "reset to
  computed"). The old flat adult/kid target editor is removed.

### AI assist (advisory, educative)

- Inline **"what's this?"** help on the activity/goal field, explaining each level and its
  g/kg meaning (educative copy).
- **"Not sure? Let AI help"** action: asks 2–3 plain questions (e.g. training frequency, goal)
  and **pre-selects the activity/goal level** for that member. AI output only sets the picker —
  the deterministic library still computes every number, so targets stay reproducible.

## Components / boundaries

- `src/lib/nutritionTargets.ts` — pure compute + rollups (unit-tested). No React, no Supabase.
- `src/lib/memberData.ts` — Supabase CRUD for `household_members` (mirrors `settingsData.ts`).
- Onboarding member step + Settings member manager — UI, consume the two libs above.
- AI assist — a small advisory call that returns an `ActivityLevel`, used only to set the form.
- `HouseholdProvider` exposes `members` so Home/Recipe can compute rollups and per-member views.

## Error handling & edge cases

- **Zero members:** onboarding requires ≥1; Settings blocks removing the last member.
- **Missing/implausible inputs:** form validation (weight > 0, age 0–129); compute clamps to
  sensible ranges rather than emitting NaN.
- **All-kids household:** family total still sums correctly; the "first adult" recipe selector
  falls back to the first member when no adult exists.
- **Override clears:** an empty/null override entry means "use computed".

## Testing

- Unit tests on `nutritionTargets.ts`: known profiles → expected protein/calorie/micros
  (e.g. 60 kg sedentary female adult, 70 kg strength-training male, 8-year-old), kid detection,
  override application, family/kid rollups.
- Update `onboardingSchema.test.ts`, `householdDefaults.test.ts`, `Onboarding.test.tsx` for the
  member-list shape.
- `tsc -b` / `npm run typecheck` clean; full suite green (real typecheck is `tsc -b`, per
  [[flexible-plan-feature]]).

## Out of scope (future)

- Pregnancy / lactation targets.
- Height-based BMR (Mifflin-St Jeor) and goal-based calorie deficits/surpluses.
- Weight units other than kg.
- Per-member dietary restrictions/allergies (separate feature).
