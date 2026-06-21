interface NutritionStripProps {
  totals: { calories: number; protein: number; fiber: number }
  targets: { calories: number; protein: number; fiber: number }
}

export default function NutritionStrip({ totals, targets }: NutritionStripProps) {
  const items = [
    { label: 'Calories', actual: totals.calories, target: targets.calories, unit: '' },
    { label: 'Protein', actual: totals.protein, target: targets.protein, unit: 'g' },
    { label: 'Fiber', actual: totals.fiber, target: targets.fiber, unit: 'g' },
  ]

  return (
    <div className="grid grid-cols-3 divide-x divide-ink/10 border-y border-ink/10 py-4">
      {items.map(({ label, actual, target, unit }) => {
        const met = target > 0 && actual >= target
        const pct = target > 0 ? Math.min(1, actual / target) : 0
        return (
          <div key={label} className="px-2 text-center">
            <p className="eyebrow">{label}</p>
            <p className="mt-2 font-display text-[22px] leading-none font-medium text-ink nums">
              {actual}<span className="text-[15px] text-ink-faint">{unit}</span>
            </p>
            <p className="mt-1 text-[11px] text-ink-faint nums">of {target}{unit}</p>
            <div className="mt-2 mx-auto h-[3px] w-10 rounded-full bg-ink/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-editorial"
                style={{ width: `${pct * 100}%`, backgroundColor: met ? '#5e6b3f' : '#b8512e' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
