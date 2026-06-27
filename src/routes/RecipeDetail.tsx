import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'motion/react'
import type { Recipe } from '../lib/recipe'
import { toNutrientMap } from '../lib/recipe'
import { scaleAmount } from '../lib/scale'
import { deleteRecipe, getRecipe } from '../lib/recipes'
import { useAuth } from '../context/AuthProvider'
import { useHousehold } from '../context/HouseholdProvider'
import TopBar from '../components/TopBar'
import Icon from '../components/Icon'
import NutritionPanel from '../components/NutritionPanel'
import { effectiveTargets } from '../lib/nutritionTargets'
import type { TargetOption } from '../components/NutritionPanel'

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

      <div className="screen space-y-7 pt-5">
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map((tag) => (
              <span key={tag}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow ${
                  tag === 'cheat' ? 'bg-terracotta text-bone-surface' : 'bg-olive-soft text-olive-dark'
                }`}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {recipe.link_url && (
          <a href={recipe.link_url} target="_blank" rel="noreferrer" className="btn-primary text-[13px]">
            Watch / open recipe
          </a>
        )}

        {recipe.ingredients.length > 0 && (
          <div className="pt-2 rule">
            <div className="flex items-center justify-between mb-3 mt-4">
              <h2 className="eyebrow">Ingredients</h2>
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-eyebrow text-ink-faint">Serves</span>
                <button type="button" aria-label="Fewer servings" onClick={() => setServes((s) => Math.max(1, s - 1))}
                  className="h-7 w-7 rounded-full border border-ink/15 text-ink-soft">−</button>
                <span className="font-display text-[18px] text-ink nums w-5 text-center">{serves}</span>
                <button type="button" aria-label="More servings" onClick={() => setServes((s) => Math.min(12, s + 1))}
                  className="h-7 w-7 rounded-full border border-ink/15 text-ink-soft">+</button>
              </div>
            </div>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => {
                const amount = scaleAmount(ing.amount, serves)
                return (
                  <li key={i} className="text-[15px] text-ink-soft">
                    {amount ? `${amount} · ${ing.item}` : ing.item}
                  </li>
                )
              })}
            </ul>
            {familyCount > 1 && (
              <button type="button" onClick={() => setServes(familyCount)}
                className="mt-2 text-[12px] font-semibold text-terracotta">Scale to my family ({familyCount})</button>
            )}
          </div>
        )}

        {recipe.steps.length > 0 && (
          <div className="pt-2 rule">
            <h2 className="eyebrow mb-3 mt-4">Method</h2>
            <ol className="space-y-3.5">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3.5 text-[15px] leading-relaxed text-ink-soft">
                  <span className="font-display text-[17px] leading-none text-terracotta">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="pt-2 rule">
          <div className="mt-4">
            <NutritionPanel
              values={toNutrientMap(recipe.nutrients)}
              options={targetOptions}
              estimated={recipe.nutrition_estimated}
            />
          </div>
        </div>

        {isCreator && (
          <button type="button" onClick={onDelete}
            className="text-sm font-semibold text-red-600 transition-colors hover:text-red-700">
            Delete recipe
          </button>
        )}
      </div>
    </>
  )
}
