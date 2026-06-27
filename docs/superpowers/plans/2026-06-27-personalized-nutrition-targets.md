# Personalized Per-Member Nutrition Targets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two flat reference targets (`targets_adult` / `targets_kid`) with per-member nutrition targets computed deterministically from each family member's sex/age/weight/activity, rolled up to a family total with per-member detail.

**Architecture:** A new pure library `src/lib/nutritionTargets.ts` computes the full 17-nutrient target map for one member (protein g/kg from an activity/goal table for adults, pediatric bands for kids; calories weight-based × activity factor; carbs/fats/fiber derived from calories; 12 micronutrients from age/sex RDA bands). A new `household_members` table **replaces** the `kids` table and the settings columns `adults`/`targets_adult`/`targets_kid`. `HouseholdProvider` loads members, derives the legacy `kids` list (age < 18) so downstream code is untouched, and exposes computed `familyTargets`/`kidTargets`. UI surfaces (Onboarding, Settings, Home, Recipe detail) manage members and compare against computed targets. An advisory AI endpoint can pre-select the activity level for unsure users — it never produces numbers.

**Tech Stack:** React + TypeScript (Vite), Zod, Supabase (Postgres + RLS + RPC), Hono server (OpenAI), Vitest. Real typecheck is `tsc -b` / `npm run typecheck` (per `flexible-plan-feature` memory).

**Testing convention:** Per the `no-tdd-implement-directly` user preference, only the **pure** library (Task 1) is built test-first. UI/DB/server tasks are implemented directly and verified with `tsc -b`, the relevant unit test, and `npm run build`. Spec: `docs/superpowers/specs/2026-06-27-personalized-nutrition-targets-design.md`.

**Branch:** `feat/personalized-nutrition-targets` (already created off `feat/per-person-nutrition`).

---

## Task 1: Calculation engine (`src/lib/nutritionTargets.ts`)

**Files:**
- Create: `src/lib/nutritionTargets.ts`
- Test: `src/lib/nutritionTargets.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/nutritionTargets.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeTargets, effectiveTargets, isKid, familyTargets, kidTargets,
  type Member, type MemberProfile,
} from './nutritionTargets'

const adult = (over: Partial<MemberProfile> = {}): MemberProfile => ({
  id: 'a', name: 'Mum', sex: 'female', age: 35, weightKg: 60, activity: 'sedentary', ...over,
})
const member = (p: MemberProfile, overrides = {}): Member => ({ ...p, overrides })

describe('computeTargets — adults', () => {
  it('protein = weight × g/kg from the activity table (sedentary 0.8)', () => {
    expect(computeTargets(adult()).protein).toBe(48) // 60 × 0.8
  })
  it('strength training uses 1.8 g/kg', () => {
    expect(computeTargets(adult({ activity: 'strength', weightKg: 70 })).protein).toBe(126) // 70 × 1.8
  })
  it('fat_loss uses 2.0 g/kg but maintenance calories (not below moderate-equivalent)', () => {
    const t = computeTargets(adult({ activity: 'fat_loss', weightKg: 70 }))
    expect(t.protein).toBe(140) // 70 × 2.0
    expect(t.calories).toBe(Math.round(70 * 22 * 1.45)) // maintenance factor, no deficit
  })
  it('calories = weight × 22 × activity factor', () => {
    expect(computeTargets(adult({ weightKg: 70, activity: 'moderate' })).calories).toBe(Math.round(70 * 22 * 1.375))
  })
  it('derives carbs/fats/fiber from calories', () => {
    const t = computeTargets(adult({ weightKg: 70, activity: 'moderate' }))
    const cal = t.calories as number
    expect(t.carbs).toBe(Math.round((cal * 0.5) / 4))
    expect(t.healthy_fats).toBe(Math.round((cal * 0.3) / 9))
    expect(t.fiber).toBe(Math.round((cal / 1000) * 14))
  })
  it('pulls micros from the adult female 19-50 band (iron 18, calcium 1000)', () => {
    const t = computeTargets(adult())
    expect(t.iron).toBe(18)
    expect(t.calcium).toBe(1000)
  })
  it('adult male 19-50 band differs (iron 8)', () => {
    expect(computeTargets(adult({ sex: 'male' })).iron).toBe(8)
  })
  it('returns all 17 nutrient keys', () => {
    const t = computeTargets(adult())
    const keys = ['calories','protein','carbs','healthy_fats','fiber','vitamin_a','vitamin_c','vitamin_d','folate','choline','vitamin_b12','iron','calcium','potassium','zinc','magnesium','omega_3']
    for (const k of keys) expect(typeof t[k]).toBe('number')
  })
})

describe('computeTargets — kids', () => {
  const kid = (over: Partial<MemberProfile> = {}): MemberProfile =>
    ({ id: 'k', name: 'Aria', sex: 'female', age: 8, weightKg: 25, activity: 'sedentary', ...over })
  it('kid protein uses pediatric g/kg (4-13 → 0.95), ignores activity', () => {
    expect(computeTargets(kid({ activity: 'strength' })).protein).toBe(Math.round(25 * 0.95)) // 24
  })
  it('kid calories come from the age/sex band, not weight', () => {
    expect(computeTargets(kid()).calories).toBe(1300) // 4-8 female
  })
  it('kid micros use the 4-8 band (calcium 1000)', () => {
    expect(computeTargets(kid()).calcium).toBe(1000)
  })
})

describe('isKid', () => {
  it('under 18 is a kid', () => { expect(isKid({ ...adult({ age: 17 }) })).toBe(true) })
  it('18+ is an adult', () => { expect(isKid({ ...adult({ age: 18 }) })).toBe(false) })
})

describe('effectiveTargets', () => {
  it('applies overrides on top of computed values', () => {
    const m = member(adult(), { protein: 100 })
    expect(effectiveTargets(m).protein).toBe(100)
    expect(effectiveTargets(m).calories).toBe(computeTargets(adult()).calories)
  })
  it('ignores non-numeric override entries', () => {
    const m = member(adult(), { protein: null })
    expect(effectiveTargets(m).protein).toBe(48)
  })
})

describe('rollups', () => {
  const mum = member(adult({ id: 'm', weightKg: 60 }))
  const dad = member(adult({ id: 'd', sex: 'male', weightKg: 80, activity: 'strength' }))
  const kid = member(adult({ id: 'k', age: 8, sex: 'male', weightKg: 25 }))
  it('familyTargets sums every member', () => {
    const f = familyTargets([mum, dad, kid])
    expect(f.protein).toBe(
      (effectiveTargets(mum).protein as number) +
      (effectiveTargets(dad).protein as number) +
      (effectiveTargets(kid).protein as number),
    )
  })
  it('kidTargets sums only under-18s', () => {
    expect(kidTargets([mum, dad, kid]).protein).toBe(effectiveTargets(kid).protein)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nutritionTargets.test.ts`
Expected: FAIL — "Cannot find module './nutritionTargets'".

- [ ] **Step 3: Implement the engine**

```ts
// src/lib/nutritionTargets.ts
import { NUTRIENT_KEYS, type NutrientMap } from './nutrients'

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

export interface Member extends MemberProfile {
  overrides: NutrientMap // sparse; numeric entries win over computed values
}

const KID_MAX_AGE = 18 // under 18 = kid (school box + kid rollup)
const RMR_PER_KG = 22  // rough resting metabolic rate kcal/kg/day for adults

// Adult activity/goal → protein g/kg (user-supplied table, representative values).
const PROTEIN_G_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 0.8, moderate: 1.1, strength: 1.8, fat_loss: 2.0,
}
// Adult activity/goal → calorie multiplier on RMR. fat_loss stays at maintenance (no deficit).
const CALORIE_ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, moderate: 1.375, strength: 1.55, fat_loss: 1.45,
}

export function isKid(m: Pick<MemberProfile, 'age'>): boolean {
  return m.age < KID_MAX_AGE
}

function kidProteinPerKg(age: number): number {
  if (age <= 3) return 1.05
  if (age <= 13) return 0.95
  return 0.85 // 14-17
}

function kidCalories(age: number, sex: Sex): number {
  if (age <= 3) return 1000
  if (age <= 8) return sex === 'male' ? 1400 : 1300
  if (age <= 13) return sex === 'male' ? 1800 : 1600
  return sex === 'male' ? 2400 : 2000 // 14-17
}

// 12 micronutrients by life-stage band. Standard DRI-aligned defaults; all editable via override.
type MicroBand = Record<string, number>
const MICRO_BANDS: Record<string, MicroBand> = {
  toddler:  { vitamin_a: 300, vitamin_c: 15, vitamin_d: 15, folate: 150, choline: 200, vitamin_b12: 0.9, iron: 7,  calcium: 700,  potassium: 2000, zinc: 3,  magnesium: 80,  omega_3: 0.7 },
  child4_8: { vitamin_a: 400, vitamin_c: 25, vitamin_d: 15, folate: 200, choline: 250, vitamin_b12: 1.2, iron: 10, calcium: 1000, potassium: 2300, zinc: 5,  magnesium: 130, omega_3: 0.9 },
  child9_13:{ vitamin_a: 600, vitamin_c: 45, vitamin_d: 15, folate: 300, choline: 375, vitamin_b12: 1.8, iron: 8,  calcium: 1300, potassium: 2500, zinc: 8,  magnesium: 240, omega_3: 1.2 },
  teen_m:   { vitamin_a: 900, vitamin_c: 75, vitamin_d: 15, folate: 400, choline: 550, vitamin_b12: 2.4, iron: 11, calcium: 1300, potassium: 3000, zinc: 11, magnesium: 410, omega_3: 1.6 },
  teen_f:   { vitamin_a: 700, vitamin_c: 65, vitamin_d: 15, folate: 400, choline: 400, vitamin_b12: 2.4, iron: 15, calcium: 1300, potassium: 2300, zinc: 9,  magnesium: 360, omega_3: 1.1 },
  adult_m:  { vitamin_a: 900, vitamin_c: 90, vitamin_d: 15, folate: 400, choline: 550, vitamin_b12: 2.4, iron: 8,  calcium: 1000, potassium: 3400, zinc: 11, magnesium: 400, omega_3: 1.6 },
  adult_f:  { vitamin_a: 700, vitamin_c: 75, vitamin_d: 15, folate: 400, choline: 425, vitamin_b12: 2.4, iron: 18, calcium: 1000, potassium: 2600, zinc: 8,  magnesium: 310, omega_3: 1.1 },
  senior_m: { vitamin_a: 900, vitamin_c: 90, vitamin_d: 20, folate: 400, choline: 550, vitamin_b12: 2.4, iron: 8,  calcium: 1200, potassium: 3400, zinc: 11, magnesium: 420, omega_3: 1.6 },
  senior_f: { vitamin_a: 700, vitamin_c: 75, vitamin_d: 20, folate: 400, choline: 425, vitamin_b12: 2.4, iron: 8,  calcium: 1200, potassium: 2600, zinc: 8,  magnesium: 320, omega_3: 1.1 },
}

function microBand(age: number, sex: Sex): MicroBand {
  if (age <= 3) return MICRO_BANDS.toddler
  if (age <= 8) return MICRO_BANDS.child4_8
  if (age <= 13) return MICRO_BANDS.child9_13
  if (age <= 18) return sex === 'male' ? MICRO_BANDS.teen_m : MICRO_BANDS.teen_f
  if (age <= 50) return sex === 'male' ? MICRO_BANDS.adult_m : MICRO_BANDS.adult_f
  return sex === 'male' ? MICRO_BANDS.senior_m : MICRO_BANDS.senior_f
}

// Full 17-nutrient target map for one member (before overrides).
export function computeTargets(m: MemberProfile): NutrientMap {
  const kid = isKid(m)
  const calories = kid
    ? kidCalories(m.age, m.sex)
    : Math.round(m.weightKg * RMR_PER_KG * CALORIE_ACTIVITY_FACTOR[m.activity])
  const proteinPerKg = kid ? kidProteinPerKg(m.age) : PROTEIN_G_PER_KG[m.activity]
  return {
    calories,
    protein: Math.round(m.weightKg * proteinPerKg),
    carbs: Math.round((calories * 0.5) / 4),
    healthy_fats: Math.round((calories * 0.3) / 9),
    fiber: Math.round((calories / 1000) * 14),
    ...microBand(m.age, m.sex),
  }
}

// Computed targets with the member's sparse overrides applied.
export function effectiveTargets(m: Member): NutrientMap {
  const base = computeTargets(m)
  const out: NutrientMap = { ...base }
  for (const [k, v] of Object.entries(m.overrides ?? {})) {
    if (typeof v === 'number') out[k] = v
  }
  return out
}

function sumTargets(members: Member[]): Record<string, number> {
  const total: Record<string, number> = {}
  for (const k of NUTRIENT_KEYS) total[k] = 0
  for (const m of members) {
    const t = effectiveTargets(m)
    for (const k of NUTRIENT_KEYS) total[k] += typeof t[k] === 'number' ? (t[k] as number) : 0
  }
  return total
}

export function familyTargets(members: Member[]): Record<string, number> {
  return sumTargets(members)
}

export function kidTargets(members: Member[]): Record<string, number> {
  return sumTargets(members.filter(isKid))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nutritionTargets.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutritionTargets.ts src/lib/nutritionTargets.test.ts
git commit -m "feat: deterministic per-member nutrition target engine"
```

---

## Task 2: Migration `0010_household_members.sql`

**Files:**
- Create: `supabase/migrations/0010_household_members.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0010_household_members.sql
-- Personalized per-member nutrition targets.
-- household_members replaces the kids table and the flat settings targets.
-- Clean cutover (consistent with 0009): existing kids rows are dropped.

-- 1. New members table.
create table if not exists household_members (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  name           text,
  sex            text not null check (sex in ('male','female')),
  age            int  not null check (age >= 0 and age < 130),
  weight_kg      numeric not null check (weight_kg > 0),
  activity_level text not null check (activity_level in ('sedentary','moderate','strength','fat_loss')),
  overrides      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

alter table household_members enable row level security;

create policy "household_members read" on household_members for select
  using (household_id = current_household_id());
create policy "household_members write" on household_members for all
  using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- 2. Settings: drop the flat targets + adults count (members are the source of truth now).
alter table household_settings drop column if exists targets_adult;
alter table household_settings drop column if exists targets_kid;
alter table household_settings drop column if exists adults;

-- 3. Drop the kids table (superseded by household_members; nothing FK-references it).
drop table if exists kids cascade;

-- 4. Re-sign the onboarding RPC: members come in as a jsonb array; no kids/adults params.
drop function if exists create_household_with_setup(text, text, text[], int, time, time);

create or replace function create_household_with_setup(
  p_name text,
  p_display_name text,
  p_members jsonb,
  p_evening time,
  p_morning time
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
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

  insert into household_settings (household_id, evening_reminder_time, morning_reminder_time)
    values (v_household_id, p_evening, p_morning);

  insert into household_members (household_id, name, sex, age, weight_kg, activity_level)
  select v_household_id,
         nullif(m->>'name', ''),
         m->>'sex',
         (m->>'age')::int,
         (m->>'weight_kg')::numeric,
         m->>'activity_level'
  from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as m;

  -- Seed the default staples set (preserved from migration 0008/0009).
  foreach v_staple in array v_default_staples loop
    insert into household_staples (household_id, name) values (v_household_id, v_staple)
      on conflict do nothing;
  end loop;

  return v_household_id;
end;
$$;

grant execute on function create_household_with_setup(text, text, jsonb, time, time) to authenticated;
```

- [ ] **Step 2: Sanity-check the SQL compiles mentally**

Verify: `current_household_id()` exists (used by other RLS policies — confirm with `grep -n "current_household_id" supabase/migrations/0001_foundation.sql`). Expected: function defined in an earlier migration. No `kid_id` foreign keys exist (confirm with `grep -rn "references kids" supabase/migrations`). Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_household_members.sql
git commit -m "feat: 0010 household_members table replaces kids + flat targets"
```

> **Note for executor:** Migration 0010 (like 0009) must be applied MANUALLY in Supabase. It drops the `kids` table — acceptable clean cutover in dev. Apply 0009 first if not already applied.

---

## Task 3: Member data access (`src/lib/memberData.ts`)

**Files:**
- Create: `src/lib/memberData.ts`

- [ ] **Step 1: Implement CRUD + row mapping**

```ts
// src/lib/memberData.ts
import { supabase } from './supabase'
import type { Member, Sex, ActivityLevel } from './nutritionTargets'
import type { NutrientMap } from './nutrients'

// DB row shape (snake_case) for household_members.
export interface MemberRow {
  id: string
  household_id: string
  name: string | null
  sex: Sex
  age: number
  weight_kg: number
  activity_level: ActivityLevel
  overrides: NutrientMap
}

// Fields a form supplies when creating/updating a member.
export interface MemberInput {
  name: string | null
  sex: Sex
  age: number
  weight_kg: number
  activity_level: ActivityLevel
  overrides?: NutrientMap
}

// Map a DB row to the camelCase Member the engine consumes.
export function rowToMember(r: MemberRow): Member {
  return {
    id: r.id,
    name: r.name,
    sex: r.sex,
    age: r.age,
    weightKg: Number(r.weight_kg),
    activity: r.activity_level,
    overrides: r.overrides ?? {},
  }
}

export async function getMembers(householdId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as MemberRow[]).map(rowToMember)
}

export async function addMember(householdId: string, input: MemberInput): Promise<Member> {
  const { data, error } = await supabase
    .from('household_members')
    .insert({ household_id: householdId, overrides: {}, ...input })
    .select('*')
    .single()
  if (error) throw error
  return rowToMember(data as MemberRow)
}

export async function updateMember(id: string, input: Partial<MemberInput>): Promise<void> {
  const { error } = await supabase.from('household_members').update(input).eq('id', id)
  if (error) throw error
}

export async function removeMember(id: string): Promise<void> {
  const { error } = await supabase.from('household_members').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors from `src/lib/memberData.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/memberData.ts
git commit -m "feat: household_members data access layer"
```

---

## Task 4: Onboarding schema (`src/lib/onboardingSchema.ts`)

**Files:**
- Modify: `src/lib/onboardingSchema.ts`
- Test: `src/lib/onboardingSchema.test.ts`

- [ ] **Step 1: Replace the schema**

```ts
// src/lib/onboardingSchema.ts
import { z } from 'zod'

export const memberSchema = z.object({
  name: z.string().trim().default(''),
  sex: z.enum(['male', 'female']),
  age: z.number().int().min(0).max(129),
  weight_kg: z.number().positive(),
  activity_level: z.enum(['sedentary', 'moderate', 'strength', 'fat_loss']),
})

export type MemberFormValue = z.infer<typeof memberSchema>

export const onboardingSchema = z.object({
  householdName: z.string().trim().min(1, 'Household name is required'),
  displayName: z.string().trim().min(1, 'Your name is required'),
  members: z.array(memberSchema).min(1, 'Add at least one family member'),
  evening_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
  morning_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
```

- [ ] **Step 2: Update the schema tests**

Open `src/lib/onboardingSchema.test.ts`. Replace any `kids`/`adults` fixtures with a valid `members` array, and assert the new rules. Replace the whole file body's test cases with:

```ts
import { describe, it, expect } from 'vitest'
import { onboardingSchema } from './onboardingSchema'

const base = {
  householdName: 'Star Family',
  displayName: 'Mouni',
  members: [{ name: 'Mouni', sex: 'female', age: 35, weight_kg: 60, activity_level: 'moderate' }],
  evening_reminder_time: '20:00',
  morning_reminder_time: '07:00',
}

describe('onboardingSchema', () => {
  it('accepts a valid household with one member', () => {
    expect(onboardingSchema.safeParse(base).success).toBe(true)
  })
  it('requires at least one member', () => {
    const r = onboardingSchema.safeParse({ ...base, members: [] })
    expect(r.success).toBe(false)
  })
  it('rejects an invalid activity level', () => {
    const r = onboardingSchema.safeParse({
      ...base,
      members: [{ ...base.members[0], activity_level: 'bogus' }],
    })
    expect(r.success).toBe(false)
  })
  it('rejects non-positive weight', () => {
    const r = onboardingSchema.safeParse({
      ...base,
      members: [{ ...base.members[0], weight_kg: 0 }],
    })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 3: Run the schema tests**

Run: `npx vitest run src/lib/onboardingSchema.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/onboardingSchema.ts src/lib/onboardingSchema.test.ts
git commit -m "feat: onboarding schema takes a member list"
```

---

## Task 5: Household settings defaults (`src/lib/householdDefaults.ts`)

**Files:**
- Modify: `src/lib/householdDefaults.ts`

- [ ] **Step 1: Drop targets/adults from settings; rename helper**

```ts
// src/lib/householdDefaults.ts

export interface HouseholdSettings {
  evening_reminder_time: string
  morning_reminder_time: string
  timezone: string
}

export function defaultSettings(): HouseholdSettings {
  return {
    evening_reminder_time: '20:00',
    morning_reminder_time: '07:00',
    timezone: 'UTC',
  }
}
```

- [ ] **Step 2: Typecheck (expect known breakages to fix in later tasks)**

Run: `npm run typecheck`
Expected: errors only in `HouseholdProvider.tsx`, `Onboarding.tsx`, `Settings.tsx` referencing `defaultTargets`/`targets_adult`/`adults` — these are fixed in Tasks 6, 7, 11. No errors inside `householdDefaults.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/lib/householdDefaults.ts
git commit -m "refactor: household settings drop targets/adults (members own targets)"
```

---

## Task 6: Household provider (`src/context/HouseholdProvider.tsx`)

**Files:**
- Modify: `src/context/HouseholdProvider.tsx`

- [ ] **Step 1: Load members, derive kids, expose computed targets**

Replace the entire file with:

```tsx
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'
import { defaultSettings, type HouseholdSettings } from '../lib/householdDefaults'
import { getMembers } from '../lib/memberData'
import { familyTargets as computeFamilyTargets, kidTargets as computeKidTargets, isKid, type Member } from '../lib/nutritionTargets'

interface Kid { id: string; name: string }
interface HouseholdState {
  householdId: string | null
  members: Member[]
  kids: Kid[]
  settings: HouseholdSettings | null
  displayName: string | null
  loading: boolean
  adults: number
  familyCount: number
  kidCount: number
  familyTargets: Record<string, number>
  kidTargets: Record<string, number>
  refresh: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState>({
  householdId: null, members: [], kids: [], settings: null, displayName: null, loading: true,
  adults: 0, familyCount: 0, kidCount: 0,
  familyTargets: {}, kidTargets: {},
  refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [settings, setSettings] = useState<HouseholdSettings | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (authLoading) { return }
    if (!session) { setHouseholdId(null); setMembers([]); setSettings(null); setDisplayName(null); setLoading(false); return }
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles').select('household_id, display_name').eq('id', session.user.id).single()
    const hid = (profile as { household_id: string | null; display_name: string | null } | null)?.household_id ?? null
    const name = (profile as { household_id: string | null; display_name: string | null } | null)?.display_name ?? null
    setHouseholdId(hid)
    setDisplayName(name)
    if (hid) {
      setMembers(await getMembers(hid))
      const { data: s } = await supabase
        .from('household_settings').select('*').eq('household_id', hid).maybeSingle()
      setSettings(s as HouseholdSettings | null)
    } else {
      setMembers([])
      setSettings(null)
    }
    setLoading(false)
  }, [session, authLoading])

  useEffect(() => { void refresh() }, [refresh])

  // Legacy "kids" list derived from members (age < 18) so meal-plan/scaling code is unchanged.
  const kids: Kid[] = members.filter(isKid).map((m) => ({ id: m.id, name: m.name ?? 'Kid' }))
  const kidCount = kids.length
  const adults = members.length - kidCount
  const familyCount = members.length
  const familyTargets = computeFamilyTargets(members)
  const kidTargets = computeKidTargets(members)

  return (
    <HouseholdContext.Provider value={{
      householdId, members, kids, settings, displayName, loading,
      adults, familyCount, kidCount, familyTargets, kidTargets, refresh,
    }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors in `HouseholdProvider.tsx`. Remaining errors only in `Today.tsx`, `RecipeDetail.tsx`, `Settings.tsx`, `Onboarding.tsx` (fixed in later tasks) and in `householdDefaults`'s old usages no longer referenced here.

- [ ] **Step 3: Commit**

```bash
git add src/context/HouseholdProvider.tsx
git commit -m "feat: provider loads members and exposes computed family/kid targets"
```

---

## Task 7: Onboarding member step (`src/routes/Onboarding.tsx`)

**Files:**
- Modify: `src/routes/Onboarding.tsx`
- Test: `src/routes/Onboarding.test.tsx`

- [ ] **Step 1: Rewrite Onboarding to collect members**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useHousehold } from '../context/HouseholdProvider'
import { defaultSettings } from '../lib/householdDefaults'
import { onboardingSchema, type MemberFormValue } from '../lib/onboardingSchema'
import type { ActivityLevel, Sex } from '../lib/nutritionTargets'
import { isKid } from '../lib/nutritionTargets'

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little exercise · 0.8 g protein/kg' },
  { value: 'moderate', label: 'Moderately active', hint: 'Some exercise · ~1.1 g/kg' },
  { value: 'strength', label: 'Strength training', hint: 'Regular lifting · ~1.8 g/kg' },
  { value: 'fat_loss', label: 'Fat loss, keep muscle', hint: 'High protein · ~2.0 g/kg' },
]

type Row = MemberFormValue & { key: string }

function blankMember(): Row {
  return { key: crypto.randomUUID(), name: '', sex: 'female', age: 30, weight_kg: 60, activity_level: 'moderate' }
}

export default function Onboarding() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { refresh } = useHousehold()
  const reminders = defaultSettings()
  const [householdName, setHouseholdName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [members, setMembers] = useState<Row[]>([blankMember()])
  const [evening, setEvening] = useState(reminders.evening_reminder_time)
  const [morning, setMorning] = useState(reminders.morning_reminder_time)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function addMember() { setMembers([...members, blankMember()]) }
  function removeMember(i: number) { setMembers(members.filter((_, idx) => idx !== i)) }
  function setMember(i: number, patch: Partial<Row>) {
    setMembers(members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      householdName, displayName,
      members: members.map(({ key: _key, ...m }) => m),
      evening_reminder_time: evening, morning_reminder_time: morning,
    }
    const parsed = onboardingSchema.safeParse(payload)
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    if (!session) { setError('Not signed in'); return }
    setBusy(true)
    const { data: newId, error } = await supabase.rpc('create_household_with_setup', {
      p_name: householdName,
      p_display_name: displayName,
      p_members: parsed.data.members,
      p_evening: evening,
      p_morning: morning,
    })
    if (error || !newId) { setBusy(false); setError(error?.message ?? 'Failed to set up household'); return }
    await refresh()
    setBusy(false)
    nav('/')
  }

  return (
    <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-brand mb-1">Set up your household</h1>
      <p className="text-gray-500 mb-6">Add each family member so we can tailor nutrition to them. You can change all of this later.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Household name</label>
          <input className="w-full border rounded-xl p-3 mt-1" value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)} placeholder="e.g. Star Family" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Your name</label>
          <input className="w-full border rounded-xl p-3 mt-1" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Mouni" />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold text-gray-500 uppercase">Family members</label>
          {members.map((m, i) => (
            <div key={m.key} className="rounded-xl border p-3 space-y-2">
              <div className="flex gap-2">
                <input className="flex-1 border rounded-lg p-2" aria-label={`Member ${i + 1} name`}
                  value={m.name} onChange={(e) => setMember(i, { name: e.target.value })} placeholder="Name (optional)" />
                {members.length > 1 && (
                  <button type="button" aria-label={`Remove member ${i + 1}`}
                    className="px-3 text-red-500" onClick={() => removeMember(i)}>✕</button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-gray-500">Sex
                  <select className="w-full border rounded-lg p-2 mt-1" aria-label={`Member ${i + 1} sex`}
                    value={m.sex} onChange={(e) => setMember(i, { sex: e.target.value as Sex })}>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">Age
                  <input type="number" min={0} max={129} className="w-full border rounded-lg p-2 mt-1"
                    aria-label={`Member ${i + 1} age`} value={m.age}
                    onChange={(e) => setMember(i, { age: Number(e.target.value) || 0 })} />
                </label>
                <label className="text-xs text-gray-500">Weight (kg)
                  <input type="number" min={1} className="w-full border rounded-lg p-2 mt-1"
                    aria-label={`Member ${i + 1} weight`} value={m.weight_kg}
                    onChange={(e) => setMember(i, { weight_kg: Number(e.target.value) || 0 })} />
                </label>
              </div>
              {!isKid({ age: m.age }) && (
                <label className="text-xs text-gray-500 block">Activity / goal
                  <select className="w-full border rounded-lg p-2 mt-1" aria-label={`Member ${i + 1} activity`}
                    value={m.activity_level} onChange={(e) => setMember(i, { activity_level: e.target.value as ActivityLevel })}>
                    {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span className="text-[11px] text-gray-400">{ACTIVITY_OPTIONS.find((o) => o.value === m.activity_level)?.hint}</span>
                </label>
              )}
              {isKid({ age: m.age }) && (
                <p className="text-[11px] text-gray-400">Under 18 — targets use growth-based pediatric values.</p>
              )}
            </div>
          ))}
          <button type="button" onClick={addMember} className="text-brand font-semibold text-sm">+ Add a family member</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500">Evening reminder
            <input type="time" aria-label="Evening reminder time"
              className="w-full border rounded-xl p-2 mt-1" value={evening}
              onChange={(e) => setEvening(e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">Morning reminder
            <input type="time" aria-label="Morning reminder time"
              className="w-full border rounded-xl p-2 mt-1" value={morning}
              onChange={(e) => setMorning(e.target.value)} />
          </label>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={busy} className="w-full bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
          {busy ? 'Saving…' : 'Create household'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Update `Onboarding.test.tsx`**

Open `src/routes/Onboarding.test.tsx`. Update it so the RPC mock asserts `p_members` (an array) is sent instead of `p_kids`/`p_adults`, and any field interactions target the new member fields (e.g. fill "Member 1 name", set weight). Concretely: replace assertions referencing `p_kids` / `p_adults` with a check that the `create_household_with_setup` mock was called with an object whose `p_members` is an array of length ≥ 1, each having `sex`, `age`, `weight_kg`, `activity_level`. Keep the existing render/submit harness; only the field selectors and the RPC-arg assertion change.

- [ ] **Step 3: Run the onboarding tests + typecheck**

Run: `npx vitest run src/routes/Onboarding.test.tsx && npm run typecheck`
Expected: PASS; no type errors in `Onboarding.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Onboarding.tsx src/routes/Onboarding.test.tsx
git commit -m "feat: onboarding collects per-member profiles"
```

---

## Task 8: NutritionPanel member selector + rows fallback

**Files:**
- Modify: `src/components/NutritionPanel.tsx`
- Modify: `src/lib/nutrition.ts`

- [ ] **Step 1: Fix the target fallback in `buildNutrientRows`**

In `src/lib/nutrition.ts`, change the target fallback from the (soon-removed) `def.adultRda` to `0`:

```ts
const target = targets[def.key] ?? 0
```

(Line currently reads `const target = targets[def.key] ?? def.adultRda`.)

- [ ] **Step 2: Replace NutritionPanel's adult/kid toggle with a member selector**

```tsx
// src/components/NutritionPanel.tsx
import { useState } from 'react'
import { NUTRIENT_GROUPS, GROUP_LABELS, nutrientsByGroup, type NutrientMap } from '../lib/nutrients'
import { buildNutrientRows } from '../lib/nutrition'
import Icon from './Icon'

export interface TargetOption {
  id: string
  label: string
  targets: Record<string, number>
}

interface Props {
  values: NutrientMap // per person
  options: TargetOption[]
  estimated?: boolean
}

export default function NutritionPanel({ values, options, estimated }: Props) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? '')
  const selected = options.find((o) => o.id === selectedId) ?? options[0]
  const targets = selected?.targets ?? {}

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">Nutrition · per person</h2>
        {options.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-end">
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => setSelectedId(o.id)}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${selected?.id === o.id ? 'bg-terracotta text-bone-surface' : 'bg-ink/5 text-ink-soft'}`}>
                {o.label}
              </button>
            ))}
          </div>
        )}
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

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors in `NutritionPanel.tsx`/`nutrition.ts`. `RecipeDetail.tsx` now errors on the old `targetsAdult`/`targetsKid` props — fixed in Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/components/NutritionPanel.tsx src/lib/nutrition.ts
git commit -m "feat: nutrition panel compares against a selectable member"
```

---

## Task 9: Recipe detail per-member comparison (`src/routes/RecipeDetail.tsx`)

**Files:**
- Modify: `src/routes/RecipeDetail.tsx`

- [ ] **Step 1: Build target options from members, pass to the panel**

Change the household hook usage (line ~18) and the `NutritionPanel` usage (line ~185).

Replace:
```tsx
  const { familyCount, targetsAdult, targetsKid } = useHousehold()
```
with:
```tsx
  const { familyCount, members } = useHousehold()
```

Add this import near the other lib imports at the top:
```tsx
import { effectiveTargets } from '../lib/nutritionTargets'
import type { TargetOption } from '../components/NutritionPanel'
```

Just before `return (` (after `const initial = ...`), build the options (default = first adult, else first member):
```tsx
  const sortedMembers = [...members].sort((a, b) => Number(b.age >= 18) - Number(a.age >= 18))
  const targetOptions: TargetOption[] = sortedMembers.map((m) => ({
    id: m.id,
    label: m.name ?? (m.age < 18 ? 'Kid' : 'Adult'),
    targets: effectiveTargets(m),
  }))
```

Replace the `NutritionPanel` usage:
```tsx
            <NutritionPanel
              values={toNutrientMap(recipe.nutrients)}
              targetsAdult={targetsAdult}
              targetsKid={targetsKid}
              estimated={recipe.nutrition_estimated}
            />
```
with:
```tsx
            <NutritionPanel
              values={toNutrientMap(recipe.nutrients)}
              options={targetOptions}
              estimated={recipe.nutrition_estimated}
            />
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors in `RecipeDetail.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/RecipeDetail.tsx
git commit -m "feat: recipe detail shows % of need per selectable member"
```

---

## Task 10: Home rollups + per-member detail (`src/routes/Today.tsx`)

**Files:**
- Modify: `src/routes/Today.tsx`

- [ ] **Step 1: Compare family/kid intake (scaled by counts) vs computed targets, add per-member detail**

Replace the household hook line:
```tsx
  const { householdId, kids, displayName, targetsAdult, targetsKid } = useHousehold()
```
with:
```tsx
  const { householdId, members, kids, displayName, familyTargets, kidTargets, familyCount, kidCount } = useHousehold()
```

Add imports near the top:
```tsx
import { NUTRIENT_KEYS } from '../lib/nutrients'
import { effectiveTargets } from '../lib/nutritionTargets'
import { buildNutrientRows } from '../lib/nutrition'
```
(`buildNutrientRows` is already imported alongside `sumNutrients` — keep a single import; do not duplicate.)

Add a small helper above the component (after the `KID_SLOTS` const):
```tsx
// Scale a per-person nutrient map by how many people eat it.
function scaleMap(map: Record<string, number>, count: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of NUTRIENT_KEYS) out[k] = (map[k] ?? 0) * count
  return out
}
```

Replace the rollup block:
```tsx
  const familyTotals = sumNutrients(picks.filter((p) => familySlots.has(p.slot)).map((p) => toNutrientMap(p.recipe.nutrients)))
  const kidTotals = sumNutrients(picks.filter((p) => kidSlots.has(p.slot)).map((p) => toNutrientMap(p.recipe.nutrients)))

  const youRows = buildNutrientRows(familyTotals, targetsAdult, HEADLINE_NUTRIENTS)
  const kidRows = buildNutrientRows(kidTotals, targetsKid, HEADLINE_NUTRIENTS)
```
with:
```tsx
  // Per-person intake from each meal, scaled to how many people eat it.
  const familyPerPerson = sumNutrients(picks.filter((p) => familySlots.has(p.slot)).map((p) => toNutrientMap(p.recipe.nutrients)))
  const kidPerPerson = sumNutrients(picks.filter((p) => kidSlots.has(p.slot)).map((p) => toNutrientMap(p.recipe.nutrients)))

  const familyIntake = scaleMap(familyPerPerson as Record<string, number>, Math.max(1, familyCount))
  const kidIntake = scaleMap(kidPerPerson as Record<string, number>, Math.max(1, kidCount))

  const youRows = buildNutrientRows(familyIntake, familyTargets, HEADLINE_NUTRIENTS)
  const kidRows = buildNutrientRows(kidIntake, kidTargets, HEADLINE_NUTRIENTS)
```

Update the family strip label (it now reflects the whole family, not one person). Change:
```tsx
            <p className="eyebrow text-ink-faint">Your day · per person</p>
```
to:
```tsx
            <p className="eyebrow text-ink-faint">Your family&apos;s day · vs everyone&apos;s needs</p>
```

Add a per-member targets list directly under the family strip (inside the same `StaggerItem`, after `<NutritionStrip rows={youRows} />`):
```tsx
            {members.length > 0 && (
              <details className="pt-1">
                <summary className="cursor-pointer text-[12px] font-semibold text-terracotta">Per-person needs</summary>
                <div className="mt-2 space-y-2">
                  {members.map((m) => {
                    const t = effectiveTargets(m)
                    return (
                      <p key={m.id} className="text-[12px] text-ink-soft nums">
                        <span className="font-semibold text-ink">{m.name ?? (m.age < 18 ? 'Kid' : 'Adult')}</span>
                        {` · ${Math.round(t.calories as number)} cal · ${Math.round(t.protein as number)}g protein · ${Math.round(t.iron as number)}mg iron`}
                      </p>
                    )
                  })}
                </div>
              </details>
            )}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors in `Today.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Today.tsx
git commit -m "feat: home rolls up family intake vs family needs with per-member detail"
```

---

## Task 11: Settings member manager (`src/routes/Settings.tsx`)

**Files:**
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Replace the nutrition-targets section with a member manager + override editor**

In the imports, replace:
```tsx
import { defaultTargets } from '../lib/householdDefaults'
import { NUTRIENTS, GROUP_LABELS, NUTRIENT_GROUPS } from '../lib/nutrients'
import { updateReminderSettings, browserTimezone, updateNutritionSettings } from '../lib/settingsData'
```
with:
```tsx
import { defaultSettings } from '../lib/householdDefaults'
import { NUTRIENTS, GROUP_LABELS, NUTRIENT_GROUPS } from '../lib/nutrients'
import { updateReminderSettings, browserTimezone } from '../lib/settingsData'
import { getMembers, addMember, updateMember, removeMember } from '../lib/memberData'
import { computeTargets, isKid, type ActivityLevel, type Member, type Sex } from '../lib/nutritionTargets'
```

Replace the `const base = settings ?? defaultTargets()` line with:
```tsx
  const { householdId, settings, refresh } = useHousehold()
  const base = settings ?? defaultSettings()
```

Remove the now-unused nutrition target state (`adults`, `tAdult`, `tKid`, `tab`, `nutSaving`, `nutSaved`) and the `handleSaveNutrition` function. Add member state + an activity options const near the top of the component file (outside the component):
```tsx
const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little exercise · 0.8 g protein/kg' },
  { value: 'moderate', label: 'Moderately active', hint: 'Some exercise · ~1.1 g/kg' },
  { value: 'strength', label: 'Strength training', hint: 'Regular lifting · ~1.8 g/kg' },
  { value: 'fat_loss', label: 'Fat loss, keep muscle', hint: 'High protein · ~2.0 g/kg' },
]
```

Inside the component, add:
```tsx
  const [members, setMembers] = useState<Member[]>([])
  const [memberMsg, setMemberMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!householdId) return
    void getMembers(householdId).then(setMembers).catch(() => undefined)
  }, [householdId])

  async function patchMember(id: string, patch: Partial<Member>) {
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  async function saveMember(m: Member) {
    setMemberMsg(null)
    try {
      await updateMember(m.id, {
        name: m.name, sex: m.sex, age: m.age, weight_kg: m.weightKg,
        activity_level: m.activity, overrides: m.overrides,
      })
      await refresh()
      setMemberMsg('Saved ✓')
    } catch (e) {
      setMemberMsg(e instanceof Error ? e.message : 'Could not save member')
    }
  }

  async function handleAddMember() {
    if (!householdId) return
    try {
      const created = await addMember(householdId, {
        name: '', sex: 'female', age: 30, weight_kg: 60, activity_level: 'moderate',
      })
      setMembers([...members, created])
      await refresh()
    } catch (e) {
      setMemberMsg(e instanceof Error ? e.message : 'Could not add member')
    }
  }

  async function handleRemoveMember(id: string) {
    if (members.length <= 1) { setMemberMsg('Keep at least one member'); return }
    try {
      await removeMember(id)
      setMembers(members.filter((m) => m.id !== id))
      await refresh()
    } catch (e) {
      setMemberMsg(e instanceof Error ? e.message : 'Could not remove member')
    }
  }

  function setOverride(id: string, key: string, raw: string) {
    setMembers((ms) => ms.map((m) => {
      if (m.id !== id) return m
      const overrides = { ...m.overrides }
      if (raw.trim() === '') delete overrides[key]
      else overrides[key] = Number(raw)
      return { ...m, overrides }
    }))
  }
```

Replace the entire `{/* Household & nutrition targets */}` `<section>` (the one with the Adults input + adult/kid tabs + Save targets button) with this member-manager section:
```tsx
      {/* Family members & nutrition targets */}
      <section className="space-y-3 pt-2 border-t border-gray-100">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Family members</h2>
        <p className="text-sm text-gray-500">Targets are computed from each person. Fine-tune any value below; clear a field to go back to the computed number.</p>

        {members.map((m) => {
          const computed = computeTargets(m)
          const kid = isKid(m)
          return (
            <div key={m.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex gap-2 items-center">
                <input className="flex-1 border rounded-lg p-2 text-sm" aria-label="Member name"
                  value={m.name ?? ''} placeholder="Name"
                  onChange={(e) => patchMember(m.id, { name: e.target.value })} />
                <button type="button" aria-label="Remove member" className="px-2 text-red-500"
                  onClick={() => handleRemoveMember(m.id)}>✕</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-gray-500">Sex
                  <select className="w-full border rounded-lg p-2 mt-1" aria-label="Member sex"
                    value={m.sex} onChange={(e) => patchMember(m.id, { sex: e.target.value as Sex })}>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">Age
                  <input type="number" min={0} max={129} className="w-full border rounded-lg p-2 mt-1" aria-label="Member age"
                    value={m.age} onChange={(e) => patchMember(m.id, { age: Number(e.target.value) || 0 })} />
                </label>
                <label className="text-xs text-gray-500">Weight (kg)
                  <input type="number" min={1} className="w-full border rounded-lg p-2 mt-1" aria-label="Member weight"
                    value={m.weightKg} onChange={(e) => patchMember(m.id, { weightKg: Number(e.target.value) || 0 })} />
                </label>
              </div>
              {!kid && (
                <label className="text-xs text-gray-500 block">Activity / goal
                  <select className="w-full border rounded-lg p-2 mt-1" aria-label="Member activity"
                    value={m.activity} onChange={(e) => patchMember(m.id, { activity: e.target.value as ActivityLevel })}>
                    {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span className="text-[11px] text-gray-400">{ACTIVITY_OPTIONS.find((o) => o.value === m.activity)?.hint}</span>
                </label>
              )}
              {kid && <p className="text-[11px] text-gray-400">Under 18 — pediatric growth targets.</p>}

              <details>
                <summary className="cursor-pointer text-xs font-semibold text-brand">Fine-tune targets</summary>
                {NUTRIENT_GROUPS.map((group) => (
                  <div key={group}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-2">{GROUP_LABELS[group]}</p>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {NUTRIENTS.filter((n) => n.group === group).map((n) => (
                        <label key={n.key} className="text-xs text-gray-500">{n.label} {n.unit && `(${n.unit})`}
                          <input type="number" className="w-full border rounded-xl p-2 mt-1" aria-label={`${m.name ?? 'member'} ${n.label}`}
                            placeholder={String(computed[n.key] ?? '')}
                            value={m.overrides[n.key] ?? ''}
                            onChange={(e) => setOverride(m.id, n.key, e.target.value)} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </details>

              <button type="button" onClick={() => saveMember(m)}
                className="w-full bg-brand text-white font-bold rounded-xl py-2 text-sm">Save {m.name || 'member'}</button>
            </div>
          )
        })}

        <button type="button" onClick={handleAddMember} className="text-brand font-semibold text-sm">+ Add a family member</button>
        {memberMsg && <p className="text-sm text-gray-500">{memberMsg}</p>}
      </section>
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Settings.tsx
git commit -m "feat: settings manages family members + per-member target overrides"
```

---

## Task 12: AI activity-level assist (advisory)

**Files:**
- Modify: `server/src/app.ts`
- Create: `server/src/suggestActivity.ts`
- Create: `server/src/suggestActivity.test.ts`
- Create: `src/lib/activityAssist.ts`
- Modify: `src/routes/Settings.tsx` (wire a "Not sure?" button per adult member)

- [ ] **Step 1: Server handler (pure mapping of the AI answer to a valid level)**

```ts
// server/src/suggestActivity.ts
import { ImportError } from './errors'

const LEVELS = ['sedentary', 'moderate', 'strength', 'fat_loss'] as const
export type ActivityLevel = (typeof LEVELS)[number]

export interface AssistAnswers {
  trainsPerWeek: number   // sessions/week
  goal: 'maintain' | 'build_muscle' | 'lose_fat'
}

// Deterministic rule used both as the fallback and to validate the model's choice.
export function ruleBasedLevel(a: AssistAnswers): ActivityLevel {
  if (a.goal === 'lose_fat') return 'fat_loss'
  if (a.goal === 'build_muscle' || a.trainsPerWeek >= 3) return 'strength'
  if (a.trainsPerWeek >= 1) return 'moderate'
  return 'sedentary'
}

export function coerceLevel(value: unknown, fallback: ActivityLevel): ActivityLevel {
  return (LEVELS as readonly string[]).includes(value as string) ? (value as ActivityLevel) : fallback
}

export async function handleSuggestActivity(body: unknown, apiKey: string): Promise<{ level: ActivityLevel; why: string }> {
  const a = body as Partial<AssistAnswers> | null
  if (!a || typeof a.trainsPerWeek !== 'number' || !a.goal) {
    throw new ImportError('Missing trainsPerWeek or goal', 400)
  }
  const answers: AssistAnswers = { trainsPerWeek: a.trainsPerWeek, goal: a.goal }
  const fallback = ruleBasedLevel(answers)

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You map a person to one protein/activity level. Reply JSON {"level": one of sedentary|moderate|strength|fat_loss, "why": short sentence}.' },
          { role: 'user', content: `Trains ${answers.trainsPerWeek}x/week. Goal: ${answers.goal}.` },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch { return { level: fallback, why: 'Suggested from your answers.' } }
  if (!res.ok) return { level: fallback, why: 'Suggested from your answers.' }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null
  const content = json?.choices?.[0]?.message?.content
  try {
    const parsed = JSON.parse(content ?? '{}') as { level?: unknown; why?: unknown }
    return { level: coerceLevel(parsed.level, fallback), why: typeof parsed.why === 'string' ? parsed.why : 'Suggested from your answers.' }
  } catch {
    return { level: fallback, why: 'Suggested from your answers.' }
  }
}
```

- [ ] **Step 2: Test the pure rule + coercion**

```ts
// server/src/suggestActivity.test.ts
import { describe, it, expect } from 'vitest'
import { ruleBasedLevel, coerceLevel } from './suggestActivity'

describe('ruleBasedLevel', () => {
  it('lose_fat → fat_loss', () => { expect(ruleBasedLevel({ trainsPerWeek: 0, goal: 'lose_fat' })).toBe('fat_loss') })
  it('build_muscle → strength', () => { expect(ruleBasedLevel({ trainsPerWeek: 1, goal: 'build_muscle' })).toBe('strength') })
  it('frequent training → strength', () => { expect(ruleBasedLevel({ trainsPerWeek: 4, goal: 'maintain' })).toBe('strength') })
  it('some training → moderate', () => { expect(ruleBasedLevel({ trainsPerWeek: 1, goal: 'maintain' })).toBe('moderate') })
  it('none → sedentary', () => { expect(ruleBasedLevel({ trainsPerWeek: 0, goal: 'maintain' })).toBe('sedentary') })
})

describe('coerceLevel', () => {
  it('keeps a valid level', () => { expect(coerceLevel('strength', 'sedentary')).toBe('strength') })
  it('falls back on garbage', () => { expect(coerceLevel('nope', 'moderate')).toBe('moderate') })
})
```

- [ ] **Step 3: Mount the route in `server/src/app.ts`**

After the `import-recipe` route block, add:
```ts
app.post('/suggest-activity', async (c) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return c.json({ error: 'Server is missing OPENAI_API_KEY' }, 500)
  const authz = c.req.header('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  const userId = await verifySupabaseToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const body = await c.req.json().catch(() => null)
    return c.json(await handleSuggestActivity(body, apiKey))
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, err.status as ContentfulStatusCode)
    return c.json({ error: 'Suggestion failed' }, 500)
  }
})
```
Add the import at the top: `import { handleSuggestActivity } from './suggestActivity'`.

- [ ] **Step 4: Client helper**

```ts
// src/lib/activityAssist.ts
import { supabase } from './supabase'
import type { ActivityLevel } from './nutritionTargets'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export interface AssistAnswers {
  trainsPerWeek: number
  goal: 'maintain' | 'build_muscle' | 'lose_fat'
}

export async function suggestActivity(answers: AssistAnswers): Promise<{ level: ActivityLevel; why: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_BASE}/api/suggest-activity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(answers),
  })
  if (!res.ok) throw new Error('Could not get a suggestion')
  return res.json() as Promise<{ level: ActivityLevel; why: string }>
}
```
> **Confirm `API_BASE` convention:** check how `src/lib` calls `import-recipe` (grep `import-recipe` in `src/`) and mirror its base-URL/env handling exactly rather than assuming `VITE_API_BASE_URL`.

- [ ] **Step 5: Wire a "Not sure?" control into the Settings member card**

Inside the `!kid` branch of the member card (Task 11), under the activity `<select>`, add a button that asks two quick prompts and applies the result:
```tsx
                  <button type="button" className="mt-1 text-[11px] font-semibold text-brand"
                    onClick={async () => {
                      const freq = Number(window.prompt('How many days a week do you train? (0-7)') ?? '')
                      const goalRaw = (window.prompt('Goal? type: maintain / build_muscle / lose_fat') ?? '').trim()
                      const goal = (['maintain','build_muscle','lose_fat'].includes(goalRaw) ? goalRaw : 'maintain') as 'maintain' | 'build_muscle' | 'lose_fat'
                      try {
                        const { level } = await suggestActivity({ trainsPerWeek: Number.isFinite(freq) ? freq : 0, goal })
                        patchMember(m.id, { activity: level })
                        setMemberMsg('Suggested an activity level — review and Save.')
                      } catch (e) { setMemberMsg(e instanceof Error ? e.message : 'Could not suggest') }
                    }}>Not sure? Let AI help</button>
```
Add the import to Settings: `import { suggestActivity } from '../lib/activityAssist'`.

(Keep it simple with `window.prompt` for v1; a nicer modal can come later. This is advisory — it only sets the picker; the deterministic engine still computes every number.)

- [ ] **Step 6: Test, typecheck, build**

Run: `npx vitest run server/src/suggestActivity.test.ts && npm run typecheck && npm run typecheck:server && npm run build`
Expected: PASS; both typechecks clean; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add server/src/suggestActivity.ts server/src/suggestActivity.test.ts server/src/app.ts src/lib/activityAssist.ts src/routes/Settings.tsx
git commit -m "feat: advisory AI assist pre-selects a member's activity level"
```

---

## Task 13: Registry cleanup + full verification + memory

**Files:**
- Modify: `src/lib/nutrients.ts`
- Modify: memory files under `C:\Users\mstar\.claude\projects\D--Mouni-workspace-meal-planner\memory\`

- [ ] **Step 1: Remove the now-unused static RDA fields + seedTargets**

Confirm nothing else reads them: `grep -rn "adultRda\|kidRda\|seedTargets" src/`. Expected: no matches outside `nutrients.ts` (Tasks 5/8 removed the consumers). Then in `src/lib/nutrients.ts`:
- Remove `adultRda` and `kidRda` from the `NutrientDef` interface.
- Remove the `adultRda: ..., kidRda: ...` keys from every entry in the `NUTRIENTS` array.
- Delete the `seedTargets` function.

- [ ] **Step 2: Full verification**

Run: `npm run typecheck && npm run typecheck:server && npx vitest run && npm run build`
Expected: both typechecks clean, all tests green, build succeeds. If any file still imports `seedTargets`/`adultRda`, fix that import and re-run.

- [ ] **Step 3: Manual DB note**

Confirm in the commit message / PR description that **migration 0010 must be applied manually in Supabase** (drops `kids`, drops settings target columns) after 0009.

- [ ] **Step 4: Commit**

```bash
git add src/lib/nutrients.ts
git commit -m "refactor: drop static RDA fields now that targets are computed"
```

- [ ] **Step 5: Update memory**

Update `per-per-person-nutrition-feature.md`'s links and add a new memory `personalized-nutrition-targets-feature.md` (type: project) recording: built on branch `feat/personalized-nutrition-targets`; members table replaces kids + flat targets; deterministic engine in `nutritionTargets.ts`; migration 0010 pending manual apply; AI assist advisory only. Add a one-line pointer in `MEMORY.md`. Link `[[per-person-nutrition-feature]]`, `[[meal-planner-roadmap]]`.

---

## Self-Review (completed)

- **Spec coverage:** inputs/precision (Tasks 1,7,11) ✓; family-total + per-member display (Tasks 9,10) ✓; auto kid-by-age (Task 1 `isKid`, used everywhere) ✓; computed + override (Tasks 1,3,11) ✓; deterministic engine (Task 1) ✓; AI advisory assist (Task 12) ✓; data model + migration + RPC re-sign (Tasks 2,3,6) ✓; onboarding/settings UI (Tasks 7,11) ✓; pregnancy/height/units out of scope (not built) ✓.
- **Reconciliation beyond spec (decided here):** the `kids` table is **dropped** and the legacy `kids` list is derived from members in the provider (Task 6), keeping meal-plan/scaling code untouched. Home compares **family intake scaled by member counts** vs summed targets (Task 10) — the coherent generalization of the old per-person comparison.
- **Placeholder scan:** none — every code step has full code; the two "confirm/mirror" notes (RLS helper name, API base env) are verification checks, not deferred work.
- **Type consistency:** `Member`/`MemberProfile`/`ActivityLevel`/`Sex`/`NutrientMap` and `effectiveTargets`/`computeTargets`/`familyTargets`/`kidTargets`/`isKid`/`TargetOption`/`MemberRow`/`MemberInput` used consistently across tasks.
