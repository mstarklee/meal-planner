import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react'
import type { Recipe } from '../lib/recipe'
import { toNutrientMap } from '../lib/recipe'
import { scaleAmount } from '../lib/scale'
import { deleteRecipe, getRecipe } from '../lib/recipes'
import { useAuth } from '../context/AuthProvider'
import { useHousehold } from '../context/HouseholdProvider'
import TopBar from '../components/TopBar'
import Icon from '../components/Icon'
import NutritionPanel from '../components/NutritionPanel'
import NutritionStrip from '../components/NutritionStrip'
import SegmentedTabs from '../components/SegmentedTabs'
import { buildNutrientRows } from '../lib/nutrition'
import { HEADLINE_NUTRIENTS } from '../lib/nutrients'
import { ease } from '../components/motion'
import { effectiveTargets } from '../lib/nutritionTargets'
import type { TargetOption } from '../components/NutritionPanel'

type DetailTab = 'ingredients' | 'method' | 'nutrition'

export default function RecipeDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const { session } = useAuth()
  const { familyCount, members } = useHousehold()
  const { scrollY } = useScroll()
  const heroY = useTransform(scrollY, [0, 320], [0, 80])
  const heroScale = useTransform(scrollY, [-160, 0], [1.25, 1])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [serves, setServes] = useState(1)
  const [tab, setTab] = useState<DetailTab>('ingredients')
  const [memberId, setMemberId] = useState('')

  useEffect(() => {
    if (!id) { return }
    let active = true
    void (async () => {
      try {
        const r = await getRecipe(id)
        if (!active) { return }
        setRecipe(r)
        setLoading(false)
      } catch (err) {
        if (!active) { return }
        setError(err instanceof Error ? err.message : 'Failed to load recipe')
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [id])

  async function onDelete() {
    if (!recipe) { return }
    if (!window.confirm('Delete this recipe?')) { return }
    try {
      await deleteRecipe(recipe.id)
      nav('/recipes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete recipe')
    }
  }

  if (loading) {
    return (
      <>
        <TopBar variant="back" onBack={() => nav('/recipes')} />
        <div className="screen pt-10 text-ink-soft">Loading…</div>
      </>
    )
  }

  if (error || !recipe) {
    return (
      <>
        <TopBar variant="back" onBack={() => nav('/recipes')} />
        <div className="screen pt-10 space-y-3">
          <p className="font-display text-lg italic text-ink">{error ?? 'Recipe not found.'}</p>
        </div>
      </>
    )
  }

  const isCreator = recipe.created_by === session?.user.id
  const initial = recipe.name.trim().charAt(0).toUpperCase() || '·'

  const sortedMembers = [...members].sort((a, b) => Number(b.age >= 18) - Number(a.age >= 18))
  const targetOptions: TargetOption[] = sortedMembers.map((m) => {
    const raw = effectiveTargets(m)
    const targets: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (v !== null) targets[k] = v
    }
    return {
      id: m.id,
      label: m.name ?? (m.age < 18 ? 'Kid' : 'Adult'),
      targets,
    }
  })

  const values = toNutrientMap(recipe.nutrients)
  const selectedOption = targetOptions.find((o) => o.id === memberId) ?? targetOptions[0]
  const headlineRows = buildNutrientRows(values, selectedOption?.targets ?? {}, HEADLINE_NUTRIENTS)
  const hasNutrition = headlineRows.some((r) => r.value > 0)

  const TABS = [
    ['ingredients', 'Ingredients'],
    ['method', 'Method'],
    ['nutrition', 'Nutrition'],
  ] as const

  return (
    <>
      <TopBar
        variant="back"
        title={recipe.name}
        onBack={() => nav('/recipes')}
        actions={
          isCreator ? (
            <Link
              to={`/recipes/${recipe.id}/edit`}
              aria-label="Edit recipe"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink-soft transition-colors hover:bg-ink/5"
            >
              <Icon name="edit" size={17} />
            </Link>
          ) : undefined
        }
      />

      {/* Parallax hero */}
      <div className="relative h-72 overflow-hidden bg-bone-deep">
        {recipe.photo_url ? (
          <motion.img
            src={recipe.photo_url}
            alt=""
            style={{ y: heroY, scale: heroScale }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="monogram absolute inset-0 text-[9rem]">{initial}</span>
        )}
        <div className="absolute inset-0 scrim-b" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h1 className="font-display text-[30px] leading-[1.05] font-semibold text-bone-surface drop-shadow-sm">
            {recipe.name}
          </h1>
        </div>
      </div>

      <div className="screen space-y-6 pt-4">
        {(recipe.tags.length > 0 || recipe.link_url) && (
          <div className="flex flex-wrap items-center gap-2">
            {recipe.tags.map((tag) => (
              <span key={tag}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow ${
                  tag === 'cheat' ? 'bg-terracotta text-bone-surface' : 'bg-olive-soft text-olive-dark'
                }`}>
                {tag}
              </span>
            ))}
            {recipe.link_url && (
              <a href={recipe.link_url} target="_blank" rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-terracotta transition-colors hover:text-terracotta-dark">
                Watch / open
                <span className="-rotate-45"><Icon name="chevron" size={14} strokeWidth={2} /></span>
              </a>
            )}
          </div>
        )}

        {/* Per-person snapshot — visible without scrolling */}
        {hasNutrition && (
          <section className="rounded-2xl border border-ink/10 bg-bone-surface/50 p-4 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="eyebrow">Per person{recipe.nutrition_estimated ? ' · estimated' : ''}</h2>
              {targetOptions.length > 1 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {targetOptions.map((o) => (
                    <button key={o.id} type="button" onClick={() => setMemberId(o.id)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                        selectedOption?.id === o.id ? 'bg-terracotta text-bone-surface' : 'bg-ink/5 text-ink-soft hover:bg-ink/10'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <NutritionStrip rows={headlineRows} />
            <button type="button" onClick={() => setTab('nutrition')}
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-terracotta transition-colors hover:text-terracotta-dark">
              Full breakdown · 17 nutrients
              <span className="rotate-90"><Icon name="chevron" size={13} strokeWidth={2} /></span>
            </button>
          </section>
        )}

        {/* Tabbed content keeps the page short — each section is one tap away */}
        <SegmentedTabs<DetailTab>
          options={TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Recipe sections"
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease }}
          >
            {tab === 'ingredients' && (
              recipe.ingredients.length > 0 ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-eyebrow text-ink-faint">Serves</span>
                    <div className="flex items-center gap-3">
                      <button type="button" aria-label="Fewer servings" onClick={() => setServes((s) => Math.max(1, s - 1))}
                        className="h-8 w-8 rounded-full border border-ink/15 text-ink-soft transition-colors hover:bg-ink/5">−</button>
                      <span className="w-5 text-center font-display text-[19px] text-ink nums">{serves}</span>
                      <button type="button" aria-label="More servings" onClick={() => setServes((s) => Math.min(12, s + 1))}
                        className="h-8 w-8 rounded-full border border-ink/15 text-ink-soft transition-colors hover:bg-ink/5">+</button>
                    </div>
                  </div>
                  <ul className="divide-y divide-ink/[0.07]">
                    {recipe.ingredients.map((ing, i) => {
                      const amount = scaleAmount(ing.amount, serves)
                      return (
                        <li key={i} className="flex items-baseline gap-3 py-2.5 text-[15px]">
                          {amount && <span className="shrink-0 font-display text-[15px] text-terracotta nums">{amount}</span>}
                          <span className="text-ink-soft">{ing.item}</span>
                        </li>
                      )
                    })}
                  </ul>
                  {familyCount > 1 && (
                    <button type="button" onClick={() => setServes(familyCount)}
                      className="mt-3 text-[12px] font-semibold text-terracotta transition-colors hover:text-terracotta-dark">
                      Scale to my family ({familyCount})
                    </button>
                  )}
                </div>
              ) : (
                <p className="py-6 text-center font-display text-[15px] italic text-ink-faint">No ingredients listed.</p>
              )
            )}

            {tab === 'method' && (
              recipe.steps.length > 0 ? (
                <ol className="space-y-4">
                  {recipe.steps.map((step, i) => (
                    <li key={i} className="flex gap-4 text-[15px] leading-relaxed text-ink-soft">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terracotta-soft font-display text-[15px] text-terracotta-dark nums">{i + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-6 text-center font-display text-[15px] italic text-ink-faint">No method steps yet.</p>
              )
            )}

            {tab === 'nutrition' && (
              <NutritionPanel
                values={values}
                options={targetOptions}
                estimated={recipe.nutrition_estimated}
                {...(hasNutrition ? { selectedId: selectedOption?.id ?? '', onSelect: setMemberId } : {})}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {isCreator && (
          <div className="pt-2 rule">
            <button type="button" onClick={onDelete}
              className="mt-4 text-sm font-semibold text-red-600 transition-colors hover:text-red-700">
              Delete recipe
            </button>
          </div>
        )}
      </div>
    </>
  )
}
