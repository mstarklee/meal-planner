import { useLocation, Outlet } from 'react-router-dom'
import { motion } from 'motion/react'
import BottomTabBar from './BottomTabBar'
import { ease } from './motion'

export default function AppShell() {
  const location = useLocation()
  return (
    <div className="min-h-screen" style={{ paddingBottom: 'calc(5.5rem + var(--sab))' }}>
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
      >
        <Outlet />
      </motion.main>
      <BottomTabBar />
    </div>
  )
}
