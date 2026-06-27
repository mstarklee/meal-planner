import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { Recipe } from '../lib/recipe'
import { toNutrientMap } from '../lib/recipe'
import { HEADLINE_NUTRIENTS } from '../lib/nutrients'
import Icon from './Icon'
import { ease } from './motion'

interface MealCardProps {
  recipe: Recipe
  label: string
  isKid?: boolean
}

function nutritionLine(recipe: Recipe): string | null {
  const map = toNutrientMap(recipe.nutrients)
  const parts = HEADLINE_NUTRIENTS
    .filter((n) => typeof map[n.key] === 'number')
    .map((n) => `${Math.round(map[n.key] as number)}${n.unit === 'kcal' ? ' cal' : `${n.unit} ${n.label.toLowerCase()}`}`)
  return parts.length > 0 ? parts.join('  ·  ') : null
}

export default function MealCard({ recipe, label, isKid }: MealCardProps) {
  const [open, setOpen] = useState(false)
  const nutrition = nutritionLine(recipe)
  const initial = recipe.name.trim().charAt(0).toUpperCase() || '·'
  const labelColor = isKid ? 'text-olive' : 'text-terracotta'

  return (
    <motion.div layout className="overflow-hidden rounded-2xl bg-bone-surface shadow-soft">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left"
      >
        <div className="flex items-center gap-4 p-3.5">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-bone-deep">
            {recipe.photo_url ? (
              <img src={recipe.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="monogram absolute inset-0 text-3xl">{initial}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`eyebrow ${labelColor}`}>{label}</p>
            <h3 className="mt-1 font-display text-[18px] leading-tight font-medium text-ink truncate">{recipe.name}</h3>
            {nutrition && <p className="mt-1 text-[12px] text-ink-faint nums">{nutrition}</p>}
          </div>
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.3, ease }} className="text-ink-faint">
            <Icon name="chevron" size={18} />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-4 pt-1 space-y-4">
              {recipe.ingredients.length > 0 && (
                <div className="pt-3 rule">
                  <h4 className="eyebrow mb-2">Ingredients</h4>
                  <ul className="space-y-1">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i} className="text-[14px] text-ink-soft">
                        {ing.amount ? `${ing.amount} · ${ing.item}` : ing.item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recipe.steps.length > 0 && (
                <div>
                  <h4 className="eyebrow mb-2">Method</h4>
                  <ol className="space-y-2.5">
                    {recipe.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-[14px] text-ink-soft">
                        <span className="font-display text-terracotta text-[15px] leading-tight">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {recipe.link_url && (
                <a href={recipe.link_url} target="_blank" rel="noreferrer" className="btn-primary text-[13px]">
                  Watch / open recipe
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
