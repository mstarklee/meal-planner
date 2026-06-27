import type { IconName } from '../components/Icon'

export type NutrientGroup = 'macro' | 'vitamin' | 'mineral'

export interface NutrientDef {
  key: string
  label: string
  unit: string // 'kcal' | 'g' | 'mg' | 'µg'
  group: NutrientGroup
  icon: IconName
  why: string
  headline?: boolean
}

export const NUTRIENTS: NutrientDef[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', group: 'macro', icon: 'n-energy', why: 'Fuel for play & growth', headline: true },
  { key: 'protein', label: 'Protein', unit: 'g', group: 'macro', icon: 'n-protein', why: 'Builds muscles', headline: true },
  { key: 'carbs', label: 'Carbs', unit: 'g', group: 'macro', icon: 'n-carbs', why: 'Quick energy for the brain' },
  { key: 'healthy_fats', label: 'Healthy fats', unit: 'g', group: 'macro', icon: 'n-fats', why: 'Brain growth & vitamin uptake' },
  { key: 'fiber', label: 'Fiber', unit: 'g', group: 'macro', icon: 'n-fiber', why: 'Happy tummy & digestion', headline: true },
  { key: 'vitamin_a', label: 'Vitamin A', unit: 'µg', group: 'vitamin', icon: 'n-vit-a', why: 'Sharp eyesight' },
  { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg', group: 'vitamin', icon: 'n-vit-c', why: 'Immunity & healing' },
  { key: 'vitamin_d', label: 'Vitamin D', unit: 'µg', group: 'vitamin', icon: 'n-vit-d', why: 'Strong bones (with calcium)' },
  { key: 'folate', label: 'Folate', unit: 'µg', group: 'vitamin', icon: 'n-folate', why: 'Makes new cells (growth)' },
  { key: 'choline', label: 'Choline', unit: 'mg', group: 'vitamin', icon: 'n-choline', why: 'Memory & brain development' },
  { key: 'vitamin_b12', label: 'Vitamin B12', unit: 'µg', group: 'vitamin', icon: 'n-b12', why: 'Energy & healthy nerves' },
  { key: 'iron', label: 'Iron', unit: 'mg', group: 'mineral', icon: 'n-iron', why: 'Healthy blood & focus' },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral', icon: 'n-calcium', why: 'Strong bones & teeth' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', group: 'mineral', icon: 'n-potassium', why: 'Heart & muscles' },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'mineral', icon: 'n-zinc', why: 'Immunity & growth' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral', icon: 'n-magnesium', why: 'Muscles & calm sleep' },
  { key: 'omega_3', label: 'Omega-3', unit: 'g', group: 'mineral', icon: 'n-omega3', why: 'Brain & eye development' },
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

export const GROUP_LABELS: Record<NutrientGroup, string> = {
  macro: 'Macros', vitamin: 'Vitamins', mineral: 'Minerals',
}
