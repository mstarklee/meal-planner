import type { NutrientRow } from '../lib/nutrition'

export default function NutritionStrip({ rows }: { rows: NutrientRow[] }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-ink/10 border-y border-ink/10 py-4">
      {rows.map(({ def, value, target, pct }) => {
        const met = target > 0 && value >= target
        return (
          <div key={def.key} className="px-2 text-center">
            <p className="eyebrow">{def.label}</p>
            <p className="mt-2 font-display text-[22px] leading-none font-medium text-ink nums">
              {Math.round(value)}<span className="text-[15px] text-ink-faint">{def.unit === 'kcal' ? '' : def.unit}</span>
            </p>
            <p className="mt-1 text-[11px] text-ink-faint nums">of {target}{def.unit === 'kcal' ? '' : def.unit}</p>
            <div className="mt-2 mx-auto h-[3px] w-10 rounded-full bg-ink/10 overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-700 ease-editorial"
                style={{ width: `${pct * 100}%`, backgroundColor: met ? '#5e6b3f' : '#b8512e' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
