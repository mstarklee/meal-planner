import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import { useHousehold } from '../context/HouseholdProvider'

export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>
  return session ? <Outlet /> : <Navigate to="/login" replace />
}

export function RequireHousehold() {
  const { householdId, loading } = useHousehold()
  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>
  return householdId ? <Outlet /> : <Navigate to="/onboarding" replace />
}
