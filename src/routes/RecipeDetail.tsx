import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Recipe } from '../lib/recipe'
import { deleteRecipe, getRecipe } from '../lib/recipes'
import { useAuth } from '../context/AuthProvider'

function nutritionLine(recipe: Recipe): string | null {
  const parts: string[] = []
  if (recipe.calories !== null) { parts.push(`${recipe.calories}cal`) }
  if (recipe.protein !== null) { parts.push(`${recipe.protein}g protein`) }
  if (recipe.fiber !== null) { parts.push(`${recipe.fiber}g fiber`) }
  return parts.length > 0 ? parts.join(' · ') : null
}

const BackLink = () => (
  <Link to="/recipes" className="text-brand font-semibold text-sm">← Back</Link>
)

export default function RecipeDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const { session } = useAuth()

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
    return <div className="min-h-screen px-6 py-8 max-w-md mx-auto">Loading…</div>
  }

  if (error) {
    return (
      <div className="min-h-screen px-6 py-8 max-w-md mx-auto space-y-4">
        <p className="text-red-600 text-sm">{error}</p>
        <BackLink />
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="min-h-screen px-6 py-8 max-w-md mx-auto space-y-4">
        <p className="text-gray-500">Not found</p>
        <BackLink />
      </div>
    )
  }

  const nutrition = nutritionLine(recipe)
  const isCreator = recipe.created_by === session?.user.id

  return (
    <div className="min-h-screen px-6 py-8 max-w-md mx-auto space-y-5">
      <BackLink />

      {recipe.photo_url && (
        <img src={recipe.photo_url} alt="" className="w-full rounded-xl object-cover" />
      )}

      <div>
        <h1 className="text-2xl font-bold text-brand">{recipe.name}</h1>
        {nutrition && (
          <p className="text-sm text-gray-500 mt-1">
            {nutrition}
            {recipe.nutrition_estimated && (
              <span className="ml-2 text-gray-400">≈ estimated</span>
            )}
          </p>
        )}
      </div>

      {recipe.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {recipe.tags.map((tag) => (
            <span key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-brand-mint text-brand-dark font-semibold">
              {tag}
            </span>
          ))}
        </div>
      )}

      {recipe.link_url && (
        <a href={recipe.link_url} target="_blank" rel="noreferrer"
          className="inline-block bg-brand text-white font-bold rounded-xl px-4 py-2 text-sm">
          ▶ Watch video / open blog
        </a>
      )}

      {recipe.ingredients.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase">Ingredients</h2>
          <ul className="mt-2 space-y-1">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="text-sm text-gray-900">
                {ing.amount ? `${ing.amount} ${ing.item}` : ing.item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recipe.steps.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase">Steps</h2>
          <ol className="mt-2 space-y-2 list-decimal list-inside">
            {recipe.steps.map((step, i) => (
              <li key={i} className="text-sm text-gray-900">{step}</li>
            ))}
          </ol>
        </div>
      )}

      {isCreator && (
        <div className="flex gap-3 pt-2">
          <Link to={`/recipes/${recipe.id}/edit`}
            className="flex-1 text-center bg-brand text-white font-bold rounded-xl px-4 py-2 text-sm">
            Edit
          </Link>
          <button type="button" onClick={onDelete}
            className="flex-1 text-center border border-red-500 text-red-500 font-bold rounded-xl px-4 py-2 text-sm">
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
