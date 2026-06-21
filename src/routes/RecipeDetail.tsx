import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'motion/react'
import type { Recipe } from '../lib/recipe'
import { deleteRecipe, getRecipe } from '../lib/recipes'
import { useAuth } from '../context/AuthProvider'
import TopBar from '../components/TopBar'
import Icon from '../components/Icon'

function nutritionLine(recipe: Recipe): string | null {
  const parts: string[] = []
  if (recipe.calories !== null) { parts.push(`${recipe.calories} cal`) }
  if (recipe.protein !== null) { parts.push(`${recipe.protein}g protein`) }
  if (recipe.fiber !== null) { parts.push(`${recipe.fiber}g fiber`) }
  return parts.length > 0 ? parts.join('  ·  ') : null
}

export default function RecipeDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const { session } = useAuth()
  const { scrollY } = useScroll()
  const heroY = useTransform(scrollY, [0, 320], [0, 80])
  const heroScale = useTransform(scrollY, [-160, 0], [1.25, 1])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)

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

  const nutrition = nutritionLine(recipe)
  const isCreator = recipe.created_by === session?.user.id
  const initial = recipe.name.trim().charAt(0).toUpperCase() || '·'

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
          {nutrition && (
            <p className="mt-1.5 text-[13px] text-bone-surface/85 nums">
              {nutrition}
              {recipe.nutrition_estimated && <span className="opacity-70"> · ≈ estimated</span>}
            </p>
          )}
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
            <h2 className="eyebrow mb-3 mt-4">Ingredients</h2>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="text-[15px] text-ink-soft">
                  {ing.amount ? `${ing.amount} · ${ing.item}` : ing.item}
                </li>
              ))}
            </ul>
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
