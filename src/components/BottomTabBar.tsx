import { NavLink } from 'react-router-dom'
import { motion } from 'motion/react'
import Icon from './Icon'
import type { IconName } from './Icon'
import { springSoft } from './motion'

const tabs: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Today', icon: 'today', end: true },
  { to: '/plan', label: 'Plan', icon: 'plan' },
  { to: '/recipes', label: 'Recipes', icon: 'recipes' },
  { to: '/shop', label: 'Shop', icon: 'shop' },
  { to: '/pantry', label: 'Pantry', icon: 'pantry' },
]

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pb-safe border-t border-ink/10 bg-bone/85 backdrop-blur-xl">
      <div className="flex px-3 pt-2.5 pb-2">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className="group relative flex-1 flex flex-col items-center gap-1.5 py-1"
          >
            {({ isActive }) => (
              <>
                <span
                  className="transition-colors duration-300"
                  style={{ color: isActive ? '#b8512e' : '#a39a8b' }}
                >
                  <Icon name={t.icon} size={22} strokeWidth={isActive ? 1.8 : 1.5} />
                </span>
                <span
                  className="text-[10px] font-semibold tracking-wide transition-colors duration-300"
                  style={{ color: isActive ? '#1a1715' : '#a39a8b' }}
                >
                  {t.label}
                </span>
                {isActive && (
                  <motion.span
                    layoutId="tab-indicator"
                    transition={springSoft}
                    className="absolute -top-[11px] h-[3px] w-7 rounded-full bg-terracotta"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
