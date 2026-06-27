import { scaleAmount } from './scale'

export const PANTRY_STATUSES = ['good', 'low', 'out'] as const
export type PantryStatus = (typeof PANTRY_STATUSES)[number]

export const PANTRY_STATUS_LABELS: Record<PantryStatus, string> = {
  good: 'Good',
  low: 'Low',
  out: 'Out',
}

export function nextStatus(current: PantryStatus): PantryStatus {
  const idx = PANTRY_STATUSES.indexOf(current)
  return PANTRY_STATUSES[(idx + 1) % PANTRY_STATUSES.length]
}

export interface PantryItem {
  id: string
  household_id: string
  name: string
  status: PantryStatus
  created_at: string
}

export interface ShoppingCheck {
  id: string
  household_id: string
  item: string
  week_start: string
}

export interface ShoppingRow {
  recipeId: string
  recipeName: string
  amount: string
  item: string
  itemKey: string
  inPantry: boolean
  checked: boolean
}

export function pantryMatchesIngredient(pantryName: string, ingredientItem: string): boolean {
  const p = pantryName.toLowerCase().trim()
  const i = ingredientItem.toLowerCase().trim()
  return p.length > 0 && i.length > 0 && (i.includes(p) || p.includes(i))
}

export function isStapleItem(ingredientItem: string, stapleNames: string[]): boolean {
  return stapleNames.some((name) => pantryMatchesIngredient(name, ingredientItem))
}

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
