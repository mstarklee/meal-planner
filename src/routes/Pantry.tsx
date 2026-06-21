import { useEffect, useState, useCallback } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import type { PantryItem } from '../lib/pantry'
import { getPantryItems, addPantryItem } from '../lib/pantryData'
import PantryList from '../components/PantryList'
import ScreenHeader from '../components/ScreenHeader'
import TopBar from '../components/TopBar'
import SegmentedTabs from '../components/SegmentedTabs'
import Icon from '../components/Icon'

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
    <>
      <TopBar />
      <div className="screen pb-32">
      <ScreenHeader eyebrow="In the Kitchen" title="Pantry" />

      <SegmentedTabs
        ariaLabel="Pantry filter"
        value={filter}
        onChange={setFilter}
        options={[
          ['all', 'All'],
          ['low', 'Running low'],
        ] as const}
      />

      {error && <p className="text-terracotta-dark text-sm mt-2">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <p className="text-ink-soft text-center">Loading…</p>
        ) : (
          <PantryList items={filtered} onRefresh={load} />
        )}
      </div>

      {/* Add item bar — floats just above the tab bar */}
      <div className="fixed inset-x-0 px-4" style={{ bottom: 'calc(4.75rem + var(--sab))' }}>
        <form onSubmit={(e) => { e.preventDefault(); void handleAdd() }}
          className="flex gap-2 bg-bone-surface/95 backdrop-blur-xl rounded-2xl shadow-lift border border-ink/10 p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add pantry item…"
            className="flex-1 text-[15px] px-3 py-2 rounded-xl border border-ink/10 bg-bone/60 placeholder:text-ink-faint focus:outline-none focus:border-terracotta"
          />
          <button type="submit" disabled={!newName.trim() || adding}
            className="btn-primary text-[13px] disabled:opacity-40">
            <Icon name="plus" size={15} /> Add
          </button>
        </form>
      </div>
      </div>
    </>
  )
}
