import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'
import type { HouseholdSettings } from '../lib/householdDefaults'

interface Kid { id: string; name: string }
interface HouseholdState {
  householdId: string | null
  kids: Kid[]
  settings: HouseholdSettings | null
  displayName: string | null
  loading: boolean
  refresh: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState>({
  householdId: null, kids: [], settings: null, displayName: null, loading: true, refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [kids, setKids] = useState<Kid[]>([])
  const [settings, setSettings] = useState<HouseholdSettings | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (authLoading) { return }
    if (!session) { setHouseholdId(null); setKids([]); setSettings(null); setDisplayName(null); setLoading(false); return }
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles').select('household_id, display_name').eq('id', session.user.id).single()
    const hid = (profile as { household_id: string | null; display_name: string | null } | null)?.household_id ?? null
    const name = (profile as { household_id: string | null; display_name: string | null } | null)?.display_name ?? null
    setHouseholdId(hid)
    setDisplayName(name)
    if (hid) {
      const { data: k } = await supabase.from('kids').select('id,name').eq('household_id', hid)
      setKids((k ?? []) as Kid[])
      const { data: s } = await supabase
        .from('household_settings').select('*').eq('household_id', hid).maybeSingle()
      setSettings(s as HouseholdSettings | null)
    } else {
      setKids([])
      setSettings(null)
    }
    setLoading(false)
  }, [session, authLoading])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <HouseholdContext.Provider value={{ householdId, kids, settings, displayName, loading, refresh }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
