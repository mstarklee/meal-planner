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

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// Pure calendar arithmetic on a YYYY-MM-DD string, done in UTC to avoid DST/timezone drift.
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function nextWeekStartDate(d: Date = new Date()): string {
  return addDays(weekStartDate(d), 7)
}

function dayStripLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return `${WEEKDAY_ABBR[d.getUTCDay()]} ${d.getUTCDate()}`
}

// 14 consecutive days starting today (this + next week). index 0 = Today, 1 = Tomorrow.
export function planDays(today: Date = new Date()): { date: string; label: string }[] {
  const start = today.toISOString().slice(0, 10)
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(start, i)
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayStripLabel(date)
    return { date, label }
  })
}
