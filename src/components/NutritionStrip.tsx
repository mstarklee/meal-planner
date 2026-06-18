interface NutritionStripProps {
  totals: { calories: number; protein: number; fiber: number }
  targets: { calories: number; protein: number; fiber: number }
}

export default function NutritionStrip({ totals, targets }: NutritionStripProps) {
  const items = [
    { label: 'Cal', actual: totals.calories, target: targets.calories, unit: '' },
    { label: 'Protein', actual: totals.protein, target: targets.protein, unit: 'g' },
    { label: 'Fiber', actual: totals.fiber, target: targets.fiber, unit: 'g' },
  ]

  return (
    <div className="bg-brand-mint rounded-xl p-3 flex justify-around">
      {items.map(({ label, actual, target, unit }) => {
        const met = actual >= target
        return (
          <div key={label} className="text-center">
            <p className="text-[10px] font-semibold text-gray-500 uppercase">{label}</p>
            <p className={`text-sm font-bold ${met ? 'text-brand' : 'text-gray-700'}`}>
              {actual}{unit} / {target}{unit}
            </p>
            {met && <span className="text-brand text-xs">✓</span>}
          </div>
        )
      })}
    </div>
  )
}
