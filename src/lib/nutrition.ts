import { NUTRIENTS, type NutrientDef, type NutrientMap } from './nutrients'

// Sum per-person nutrient maps across recipes. Missing/null values count as 0.
export function sumNutrients(maps: (NutrientMap | null | undefined)[]): NutrientMap {
  const total: NutrientMap = {}
  for (const def of NUTRIENTS) {
    let sum = 0
    for (const m of maps) {
      const v = m?.[def.key]
      if (typeof v === 'number') sum += v
    }
    total[def.key] = sum
  }
  return total
}

export interface NutrientRow {
  def: NutrientDef
  value: number
  target: number
  pct: number // 0..1 (clamped)
}

// Pair each nutrient's actual value with a target map for display.
export function buildNutrientRows(
  values: NutrientMap,
  targets: Record<string, number>,
  defs: NutrientDef[] = NUTRIENTS,
): NutrientRow[] {
  return defs.map((def) => {
    const value = typeof values[def.key] === 'number' ? (values[def.key] as number) : 0
    const target = targets[def.key] ?? 0
    const pct = target > 0 ? Math.min(1, value / target) : 0
    return { def, value, target, pct }
  })
}
