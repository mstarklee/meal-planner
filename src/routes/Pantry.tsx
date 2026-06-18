import { useEffect, useState, useCallback } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import type { PantryItem } from '../lib/pantry'
import { getPantryItems, addPantryItem } from '../lib/pantryData'
import PantryList from '../components/PantryList'

type PantryFilter = 'all' | 'low'

export default function Pantry() {
  const { householdId } = useHousehold()
  const [items, setItems] = useState<PantryItem[]>([])
  const [filter, setFilter] = useState<PantryFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    try {
      const data = await getPantryItems(householdId)
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [householdId])

  useEffect(() => { void load() }, [load])

  const filtered = filter === 'low'
    ? items.filter((i) => i.status === 'low' || i.status === 'out')
    : items

  async function handleAdd() {
    if (!householdId || !newName.trim()) return
    setAdding(true)
    setError(null)
    try {
      await addPantryItem(householdId, newName)
      setNewName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-32">
      <h1 className="text-2xl font-bold text-brand">Pantry</h1>

      {/* Filter toggle */}
      <div className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['all', 'All'],
          ['low', 'Running low'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button"
            onClick={() => setFilter(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              filter === value ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <p className="text-gray-500 text-center">Loading...</p>
        ) : (
          <PantryList items={filtered} onRefresh={load} />
        )}
      </div>

      {/* Add item bar */}
      <div className="fixed bottom-20 inset-x-0 px-4 pb-3">
        <form onSubmit={(e) => { e.preventDefault(); void handleAdd() }}
          className="flex gap-2 bg-white rounded-xl shadow-lg border border-gray-200 p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add pantry item..."
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-brand"
          />
          <button type="submit" disabled={!newName.trim() || adding}
            className="bg-brand text-white font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            Add
          </button>
        </form>
      </div>
    </div>
  )
}
