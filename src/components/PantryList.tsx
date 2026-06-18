import { useState } from 'react'
import type { PantryItem, PantryStatus } from '../lib/pantry'
import { PANTRY_STATUS_LABELS, PANTRY_STATUSES, nextStatus } from '../lib/pantry'
import { updatePantryStatus, bulkUpdatePantryStatus, deletePantryItems } from '../lib/pantryData'

const STATUS_COLORS: Record<PantryStatus, string> = {
  good: 'bg-brand text-white',
  low: 'bg-orange-400 text-white',
  out: 'bg-red-500 text-white',
}

interface PantryListProps {
  items: PantryItem[]
  onRefresh: () => void
}

export default function PantryList({ items, onRefresh }: PantryListProps) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map((i) => i.id)))
    }
  }

  function exitSelect() {
    setSelecting(false)
    setSelected(new Set())
  }

  async function handleCycleStatus(item: PantryItem) {
    try {
      await updatePantryStatus(item.id, nextStatus(item.status))
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  async function handleBulkStatus(status: PantryStatus) {
    if (selected.size === 0) return
    try {
      await bulkUpdatePantryStatus([...selected], status)
      exitSelect()
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    try {
      await deletePantryItems([...selected])
      exitSelect()
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-gray-400 text-4xl">🧺</p>
        <p className="text-gray-500">No pantry items yet. Add your staples below.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Select header */}
      <div className="flex items-center justify-between mb-3">
        {selecting ? (
          <>
            <button type="button" onClick={selectAll} className="text-sm text-brand font-semibold">
              {selected.size === items.length ? 'Deselect all' : 'Select all'}
            </button>
            <button type="button" onClick={exitSelect} className="text-sm text-gray-500 font-semibold">
              Done
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setSelecting(true)} className="text-sm text-brand font-semibold ml-auto">
            Select
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      {/* Item list */}
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selecting ? toggleSelect(item.id) : handleCycleStatus(item)}
            className="w-full flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-3 py-3 text-left"
          >
            {selecting && (
              <span className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
                selected.has(item.id) ? 'border-brand bg-brand text-white' : 'border-gray-300'
              }`}>
                {selected.has(item.id) ? '✓' : ''}
              </span>
            )}
            <span className="flex-1 font-semibold text-gray-900 truncate">{item.name}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}>
              {PANTRY_STATUS_LABELS[item.status]}
            </span>
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selecting && selected.size > 0 && (
        <div className="fixed bottom-20 inset-x-0 px-4 pb-3">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3 flex gap-2">
            {PANTRY_STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => handleBulkStatus(s)}
                className={`flex-1 text-xs font-bold py-2 rounded-lg ${STATUS_COLORS[s]}`}>
                {PANTRY_STATUS_LABELS[s]}
              </button>
            ))}
            <button type="button" onClick={handleBulkDelete}
              className="flex-1 text-xs font-bold py-2 rounded-lg bg-gray-100 text-red-600">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
