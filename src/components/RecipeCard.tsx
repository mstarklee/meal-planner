import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { Recipe } from '../lib/recipe'
import { springSoft } from './motion'

function nutritionLine(recipe: Recipe): string | null {
  const parts: string[] = []
  if (recipe.calories !== null) { parts.push(`${recipe.calories} cal`) }
  if (recipe.protein !== null) { parts.push(`${recipe.protein}g protein`) }
  return parts.length > 0 ? parts.join('  ·  ') : null
}

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  const nutrition = nutritionLine(recipe)
  const initial = recipe.name.trim().charAt(0).toUpperCase() || '·'

  return (
    <motion.div whileTap={{ scale: 0.97 }} transition={springSoft}>
      <Link to={`/recipes/${recipe.id}`} className="group block">
        <div className="relative overflow-hidden rounded-2xl bg-bone-deep aspect-[4/5] shadow-soft">
          {recipe.photo_url ? (
            <img
              src={recipe.photo_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.04]"
            />
          ) : (
            <span className="monogram absolute inset-0 text-[5rem] leading-none">{initial}</span>
          )}
          {recipe.is_shared && (
            <span className="absolute top-2.5 left-2.5 rounded-full bg-bone/85 backdrop-blur px-2 py-0.5 text-[10px] font-bold tracking-eyebrow uppercase text-ink">
              Shared
            </span>
          )}
          {recipe.tags.includes('cheat') && (
            <span className="absolute top-2.5 right-2.5 rounded-full bg-terracotta px-2 py-0.5 text-[10px] font-bold tracking-eyebrow uppercase text-bone-surface">
              Cheat
            </span>
          )}
        </div>
        <h3 className="mt-2.5 font-display text-[17px] leading-snug font-medium text-ink">{recipe.name}</h3>
        {nutrition && <p className="mt-0.5 text-[12px] text-ink-faint nums">{nutrition}</p>}
      </Link>
    </motion.div>
  )
}
