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
