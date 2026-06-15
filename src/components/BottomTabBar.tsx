import { NavLink } from 'react-router-dom'

const tabs: { to: string; label: string; icon: string; end?: boolean }[] = [
  { to: '/', label: 'Today', icon: '🏠', end: true },
  { to: '/plan', label: 'Plan', icon: '📅' },
  { to: '/recipes', label: 'Recipes', icon: '📖' },
  { to: '/shop', label: 'Shop', icon: '🛒' },
  { to: '/pantry', label: 'Pantry', icon: '🧺' },
]

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t flex justify-around py-2 pb-3">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) =>
            `flex-1 text-center text-[10px] ${isActive ? 'text-brand font-bold' : 'text-gray-400'}`}>
          <span className="block text-lg">{t.icon}</span>{t.label}
        </NavLink>
      ))}
    </nav>
  )
}
