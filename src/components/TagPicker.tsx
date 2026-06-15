interface TagPickerProps {
  label: string
  options: readonly string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function TagPicker({ label, options, selected, onChange }: TagPickerProps) {
  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  }
  return (
    <div>
      <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
      <div className="flex gap-2 flex-wrap mt-1">
        {options.map((opt) => (
          <button type="button" key={opt} aria-pressed={selected.includes(opt)} onClick={() => toggle(opt)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
              selected.includes(opt) ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-500'}`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
