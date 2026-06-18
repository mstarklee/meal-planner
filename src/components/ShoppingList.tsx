import type { ShoppingRow } from '../lib/pantry'

interface ShoppingListProps {
  rows: ShoppingRow[]
  onToggle: (itemKey: string, currentlyChecked: boolean) => void
}

export default function ShoppingList({ rows, onToggle }: ShoppingListProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-gray-400 text-4xl">🛒</p>
        <p className="text-gray-500">No ingredients to show.</p>
        <p className="text-sm text-gray-400">Add recipes to your weekly pool first.</p>
      </div>
    )
  }

  const toBuy = rows.filter((r) => !r.checked && !r.inPantry)
  const checked = rows.filter((r) => r.checked && !r.inPantry)
  const inPantry = rows.filter((r) => r.inPantry)

  return (
    <div className="space-y-4">
      {toBuy.length > 0 && (
        <Section label="To buy">
          {toBuy.map((row, i) => (
            <ItemRow key={`${row.recipeId}-${row.item}-${i}`} row={row} onToggle={onToggle} />
          ))}
        </Section>
      )}

      {checked.length > 0 && (
        <Section label="Purchased">
          {checked.map((row, i) => (
            <ItemRow key={`${row.recipeId}-${row.item}-${i}`} row={row} onToggle={onToggle} />
          ))}
        </Section>
      )}

      {inPantry.length > 0 && (
        <Section label="In pantry">
          {inPantry.map((row, i) => (
            <div key={`${row.recipeId}-${row.item}-${i}`}
              className="flex items-center gap-3 px-3 py-2 opacity-40">
              <span className="w-5 h-5 rounded border-2 border-gray-200 flex items-center justify-center text-xs text-brand">✓</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500">
                  {row.amount && <span>{row.amount} </span>}{row.item}
                </p>
                <p className="text-[10px] text-gray-400">{row.recipeName}</p>
              </div>
              <span className="text-[10px] text-brand font-semibold">In pantry</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">{label}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ItemRow({ row, onToggle }: { row: ShoppingRow; onToggle: (itemKey: string, checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(row.itemKey, row.checked)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50"
    >
      <span className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
        row.checked ? 'border-brand bg-brand text-white' : 'border-gray-300'
      }`}>
        {row.checked ? '✓' : ''}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${row.checked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {row.amount && <span className="text-gray-500">{row.amount} </span>}{row.item}
        </p>
        <p className="text-[10px] text-gray-400">{row.recipeName}</p>
      </div>
    </button>
  )
}
