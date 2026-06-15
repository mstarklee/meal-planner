import { Outlet } from 'react-router-dom'
import BottomTabBar from './BottomTabBar'

export default function AppShell() {
  return (
    <div className="min-h-screen pb-20">
      <Outlet />
      <BottomTabBar />
    </div>
  )
}
