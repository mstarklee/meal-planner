import type { Recipe } from './recipe'

export const POOL_SLOTS = ['breakfast', 'lunch', 'dinner', 'kid'] as const
export type PoolSlot = (typeof POOL_SLOTS)[number]

export const PICK_SLOTS = ['breakfast', 'lunch', 'dinner', 'kid-lunch', 'kid-snack'] as const
export type PickSlot = (typeof PICK_SLOTS)[number]

export const POOL_SLOT_LABELS: Record<PoolSlot, string> = {
  breakfast: "B'fast",
  lunch: 'Lunch',
  dinner: 'Dinner',
  kid: 'Kid',
}

export const PICK_SLOT_LABELS: Record<PickSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  'kid-lunch': 'School Lunch',
  'kid-snack': 'Snack',
}

export function poolSlotFor(pick: PickSlot): PoolSlot {
  if (pick === 'kid-lunch' || pick === 'kid-snack') return 'kid'
  return pick as PoolSlot
}

export interface PoolEntry {
  id: string
  household_id: string
  recipe_id: string
  slot: PoolSlot
  week_start: string
  recipe: Recipe
}

export interface DailyPick {
  id: string
  household_id: string
  recipe_id: string
  slot: PickSlot
  pick_date: string
  recipe: Recipe
}

export function weekStartDate(d: Date = new Date()): string {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy.toISOString().slice(0, 10)
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function tomorrowDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
