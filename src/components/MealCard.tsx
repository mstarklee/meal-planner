import { useState } from 'react'
import type { Recipe } from '../lib/recipe'

interface MealCardProps {
  recipe: Recipe
  label: string
  isKid?: boolean
}

function nutritionLine(recipe: Recipe): string | null {
  const parts: string[] = []
  if (recipe.calories !== null) parts.push(`${recipe.calories}cal`)
  if (recipe.protein !== null) parts.push(`${recipe.protein}g protein`)
  if (recipe.fiber !== null) parts.push(`${recipe.fiber}g fiber`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function MealCard({ recipe, label, isKid }: MealCardProps) {
  const [open, setOpen] = useState(false)
  const nutrition = nutritionLine(recipe)

  return (
    <div className={`rounded-xl border overflow-hidden bg-white shadow-sm ${
      isKid ? 'border-kid/40' : 'border-gray-200'
    }`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex gap-3 p-3">
          {recipe.photo_url ? (
            <img src={recipe.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-brand-soft flex items-center justify-center text-2xl shrink-0">
              🍽️
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-bold uppercase ${isKid ? 'text-kid' : 'text-gray-400'}`}>{label}</p>
            <h3 className="font-bold text-gray-900 truncate">{recipe.name}</h3>
            {nutrition && <p className="text-xs text-gray-500 mt-0.5">{nutrition}</p>}
            {recipe.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {recipe.tags.map((tag) => (
                  <span key={tag}
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                      tag === 'cheat'
                        ? 'bg-orange-100 text-cheat'
                        : 'bg-brand-mint text-brand-dark'
                    }`}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="self-center text-gray-300 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3 space-y-3">
          {recipe.ingredients.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase">Ingredients</h4>
              <ul className="mt-1 space-y-0.5">
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
              <h4 className="text-[10px] font-bold text-gray-400 uppercase">Steps</h4>
              <ol className="mt-1 space-y-1 list-decimal list-inside">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="text-sm text-gray-900">{step}</li>
                ))}
              </ol>
            </div>
          )}

          {recipe.link_url && (
            <a href={recipe.link_url} target="_blank" rel="noreferrer"
              className="inline-block bg-brand text-white font-bold rounded-lg px-3 py-1.5 text-xs">
              ▶ Watch video / open blog
            </a>
          )}
        </div>
      )}
    </div>
  )
}
