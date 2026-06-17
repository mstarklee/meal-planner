import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RecipeCard from '../components/RecipeCard'
import TagPicker from '../components/TagPicker'
import { useHousehold } from '../context/HouseholdProvider'
import { listMyRecipes, listSharedRecipes } from '../lib/recipes'
import { RECIPE_TAGS } from '../lib/recipe'
import type { Recipe } from '../lib/recipe'

type Tab = 'mine' | 'shared'

export default function Recipes() {
  const { householdId } = useHousehold()
  const [tab, setTab] = useState<Tab>('mine')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data =
          tab === 'mine'
            ? householdId
              ? await listMyRecipes(householdId)
              : []
            : await listSharedRecipes()
        if (active) { setRecipes(data) }
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : 'Failed to load recipes') }
      } finally {
        if (active) { setLoading(false) }
      }
    })()
    return () => { active = false }
  }, [tab, householdId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return recipes.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) { return false }
      if (activeTags.length > 0 && !activeTags.every((t) => r.tags.includes(t))) { return false }
      return true
    })
  }, [recipes, search, activeTags])

  const filtersActive = search.trim() !== '' || activeTags.length > 0

  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand">Recipes</h1>
        <Link to="/recipes/import" className="bg-brand text-white font-bold rounded-xl px-4 py-2 text-sm">
          + Add
        </Link>
      </div>

      <div role="tablist" aria-label="Recipe source" className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['mine', 'My Recipes'],
          ['shared', 'Shared Library'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              tab === value ? 'bg-brand text-white' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
        aria-label="Search recipes" placeholder="Search recipes…"
        className="w-full border rounded-xl p-3 mt-4" />

      <div className="mt-3">
        <TagPicker label="Filter by tag" options={RECIPE_TAGS} selected={activeTags} onChange={setActiveTags} />
      </div>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 mt-6">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 mt-6">
          {filtersActive ? 'No recipes match your filters.' : 'No recipes yet — add your first.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-4">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  )
}
