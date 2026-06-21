import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RecipeCard from '../components/RecipeCard'
import TagPicker from '../components/TagPicker'
import ScreenHeader from '../components/ScreenHeader'
import TopBar from '../components/TopBar'
import Icon from '../components/Icon'
import SegmentedTabs from '../components/SegmentedTabs'
import { Reveal } from '../components/motion'
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
    <>
      <TopBar
        actions={
          <Link to="/recipes/import" className="btn-primary text-[13px] py-2">
            <Icon name="plus" size={15} /> Add
          </Link>
        }
      />
      <div className="screen">
      <ScreenHeader eyebrow="The Library" title="Recipes" />

      <SegmentedTabs
        ariaLabel="Recipe source"
        value={tab}
        onChange={setTab}
        options={[
          ['mine', 'My Recipes'],
          ['shared', 'Shared Library'],
        ] as const}
      />

      <div className="relative mt-5">
        <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-ink-faint">
          <Icon name="search" size={18} />
        </span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          aria-label="Search recipes" placeholder="Search recipes…"
          className="w-full border-0 border-b border-ink/15 bg-transparent py-2.5 pl-8 pr-3 text-[15px] placeholder:text-ink-faint focus:outline-none focus:border-terracotta" />
      </div>

      <div className="mt-4">
        <TagPicker label="Filter by tag" options={RECIPE_TAGS} selected={activeTags} onChange={setActiveTags} />
      </div>

      {error && <p className="text-terracotta-dark text-sm mt-4">{error}</p>}

      {loading ? (
        <p className="text-ink-soft mt-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-ink-soft mt-8 font-display text-lg italic">
          {filtersActive ? 'No recipes match your filters.' : 'No recipes yet — add your first.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 mt-6">
          {filtered.map((recipe, i) => (
            <Reveal key={recipe.id} delay={Math.min(i, 6) * 0.05}>
              <RecipeCard recipe={recipe} />
            </Reveal>
          ))}
        </div>
      )}
      </div>
    </>
  )
}
