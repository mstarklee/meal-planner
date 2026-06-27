import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'
import { type HouseholdSettings } from '../lib/householdDefaults'
import { getMembers } from '../lib/memberData'
import { familyTargets as computeFamilyTargets, kidTargets as computeKidTargets, isKid, type Member } from '../lib/nutritionTargets'

interface Kid { id: string; name: string }
interface HouseholdState {
  householdId: string | null
  members: Member[]
  kids: Kid[]
  settings: HouseholdSettings | null
  displayName: string | null
  loading: boolean
  adults: number
  familyCount: number
  kidCount: number
  familyTargets: Record<string, number>
  kidTargets: Record<string, number>
  refresh: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState>({
  householdId: null, members: [], kids: [], settings: null, displayName: null, loading: true,
  adults: 0, familyCount: 0, kidCount: 0,
  familyTargets: {}, kidTargets: {},
  refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [settings, setSettings] = useState<HouseholdSettings | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (authLoading) { return }
    if (!session) { setHouseholdId(null); setMembers([]); setSettings(null); setDisplayName(null); setLoading(false); return }
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles').select('household_id, display_name').eq('id', session.user.id).single()
    const hid = (profile as { household_id: string | null; display_name: string | null } | null)?.household_id ?? null
    const name = (profile as { household_id: string | null; display_name: string | null } | null)?.display_name ?? null
    setHouseholdId(hid)
    setDisplayName(name)
    if (hid) {
      setMembers(await getMembers(hid))
      const { data: s } = await supabase
        .from('household_settings').select('*').eq('household_id', hid).maybeSingle()
      setSettings(s as HouseholdSettings | null)
    } else {
      setMembers([])
      setSettings(null)
    }
    setLoading(false)
  }, [session, authLoading])

  useEffect(() => { void refresh() }, [refresh])

  // Legacy "kids" list derived from members (age < 18) so meal-plan/scaling code is unchanged.
  const kids: Kid[] = members.filter(isKid).map((m) => ({ id: m.id, name: m.name ?? 'Kid' }))
  const kidCount = kids.length
  const adults = members.length - kidCount
  const familyCount = members.length
  const familyTargets = computeFamilyTargets(members)
  const kidTargets = computeKidTargets(members)

  return (
    <HouseholdContext.Provider value={{
      householdId, members, kids, settings, displayName, loading,
      adults, familyCount, kidCount, familyTargets, kidTargets, refresh,
    }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
