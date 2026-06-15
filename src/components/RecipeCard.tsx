import { Link } from 'react-router-dom'
import type { Recipe } from '../lib/recipe'

function nutritionLine(recipe: Recipe): string | null {
  const parts: string[] = []
  if (recipe.calories !== null) { parts.push(`${recipe.calories}cal`) }
  if (recipe.protein !== null) { parts.push(`${recipe.protein}g protein`) }
  if (recipe.fiber !== null) { parts.push(`${recipe.fiber}g fiber`) }
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  const nutrition = nutritionLine(recipe)
  return (
    <Link to={`/recipes/${recipe.id}`}
      className="block rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white hover:shadow-md transition-shadow">
      {recipe.photo_url ? (
        <img src={recipe.photo_url} alt="" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-brand-soft flex items-center justify-center text-4xl" aria-hidden="true">
          🍽️
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1">
          <h2 className="font-bold text-gray-900 leading-tight">{recipe.name}</h2>
          {recipe.is_shared && (
            <span className="shrink-0 text-[10px] font-semibold text-brand">↗ Shared</span>
          )}
        </div>
        {nutrition && <p className="text-xs text-gray-500 mt-1">{nutrition}</p>}
        {recipe.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {recipe.tags.map((tag) => (
              <span key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full bg-brand-mint text-brand-dark font-semibold">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
