import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

interface Kid { id: string; name: string }
interface HouseholdState {
  householdId: string | null
  kids: Kid[]
  loading: boolean
  refresh: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState>({
  householdId: null, kids: [], loading: true, refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [kids, setKids] = useState<Kid[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (authLoading) { return }
    if (!session) { setHouseholdId(null); setKids([]); setLoading(false); return }
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles').select('household_id').eq('id', session.user.id).single()
    const hid = (profile as { household_id: string | null } | null)?.household_id ?? null
    setHouseholdId(hid)
    if (hid) {
      const { data: k } = await supabase.from('kids').select('id,name').eq('household_id', hid)
      setKids((k ?? []) as Kid[])
    } else {
      setKids([])
    }
    setLoading(false)
  }, [session, authLoading])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <HouseholdContext.Provider value={{ householdId, kids, loading, refresh }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
