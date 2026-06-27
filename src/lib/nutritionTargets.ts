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
