import type { PickSlot, PoolSlot } from './mealPlan'

// Format a number back to a short string: nice common fractions, else trimmed decimal.
function formatQty(n: number): string {
  const whole = Math.floor(n)
  const frac = n - whole
  const eighths = Math.round(frac * 8)
  const FRAC: Record<number, string> = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' }
  if (eighths === 0) return String(whole)
  if (eighths === 8) return String(whole + 1)
  const f = FRAC[eighths]
  if (f) return whole > 0 ? `${whole} ${f}` : f
  return String(Math.round(n * 100) / 100)
}

// Parse a leading quantity (int, decimal, "a/b", or "a b/c") and return [value, restString].
function parseLeadingQty(s: string): [number, string] | null {
  const m = s.match(/^\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+)|\/(\d+))?\s*/)
  if (!m) return null
  const lead = parseFloat(m[1])
  let value = lead
  if (m[2] && m[3]) value = lead + parseInt(m[2], 10) / parseInt(m[3], 10) // mixed: "1 1/2"
  else if (m[4]) value = lead / parseInt(m[4], 10) // simple: "1/2"
  return [value, s.slice(m[0].length)]
}

// Scale a free-text ingredient amount by `factor`. Non-numeric/empty amounts are unchanged.
export function scaleAmount(amount: string, factor: number): string {
  if (factor === 1 || !amount.trim()) return amount
  const parsed = parseLeadingQty(amount)
  if (!parsed) return amount
  const [value, rest] = parsed
  const scaled = formatQty(value * factor)
  return rest ? `${scaled} ${rest.trim()}` : scaled
}

// kid slots scale by the kid count; everything else by the family count.
export function countForSlot(slot: PickSlot | PoolSlot, familyCount: number, kidCount: number): number {
  return slot === 'kid' || slot === 'kid-lunch' || slot === 'kid-snack' ? kidCount : familyCount
}
