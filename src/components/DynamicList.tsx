interface DynamicListProps {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  addLabel: string
}

export default function DynamicList({ label, items, onChange, placeholder, addLabel }: DynamicListProps) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
      <div className="space-y-2 mt-1">
        {items.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input className="flex-1 border rounded-xl p-3" aria-label={`${label} ${i + 1}`}
              value={val} placeholder={placeholder}
              onChange={(e) => onChange(items.map((v, idx) => (idx === i ? e.target.value : v)))} />
            <button type="button" aria-label={`Remove ${label} ${i + 1}`} className="px-3 text-red-500"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-2 text-brand font-semibold text-sm"
        onClick={() => onChange([...items, ''])}>{addLabel}</button>
    </div>
  )
}
