import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useHousehold } from '../context/HouseholdProvider'
import { defaultTargets } from '../lib/householdDefaults'
import { onboardingSchema } from '../lib/onboardingSchema'

export default function Onboarding() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { refresh } = useHousehold()
  const t = defaultTargets()
  const [householdName, setHouseholdName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [kids, setKids] = useState<{ name: string }[]>([])
  const [targets, setTargets] = useState(t)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function addKid() { setKids([...kids, { name: '' }]) }
  function setKid(i: number, name: string) {
    setKids(kids.map((k, idx) => (idx === i ? { name } : k)))
  }
  function removeKid(i: number) { setKids(kids.filter((_, idx) => idx !== i)) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = onboardingSchema.safeParse({ householdName, displayName, kids, ...targets })
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    if (!session) { setError('Not signed in'); return }
    setBusy(true)

    const { data: hh, error: e1 } = await supabase
      .from('households').insert({ name: householdName }).select('id').single()
    if (e1 || !hh) { setBusy(false); setError(e1?.message ?? 'Failed to create household'); return }

    const { error: e2 } = await supabase
      .from('profiles').update({ household_id: (hh as { id: string }).id, display_name: displayName }).eq('id', session.user.id)
    if (e2) { setBusy(false); setError(e2.message); return }

    await supabase.from('household_settings').insert({ household_id: (hh as { id: string }).id, ...targets })
    if (kids.length) {
      await supabase.from('kids').insert(kids.map((k) => ({ household_id: (hh as { id: string }).id, name: k.name })))
    }

    await refresh()
    setBusy(false)
    nav('/')
  }

  return (
    <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-brand mb-1">Set up your household</h1>
      <p className="text-gray-500 mb-6">You can change all of this later.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Household name</label>
          <input className="w-full border rounded-xl p-3 mt-1" value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)} placeholder="e.g. Star Family" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Your name</label>
          <input className="w-full border rounded-xl p-3 mt-1" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Mouni" />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase">Kids</label>
          <div className="space-y-2 mt-1">
            {kids.map((k, i) => (
              <div key={i} className="flex gap-2">
                <input className="flex-1 border rounded-xl p-3" aria-label={`Kid ${i + 1} name`}
                  value={k.name} onChange={(e) => setKid(i, e.target.value)} placeholder="Kid's name" />
                <button type="button" aria-label={`Remove kid ${i + 1}`}
                  className="px-3 text-red-500" onClick={() => removeKid(i)}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addKid}
            className="mt-2 text-brand font-semibold text-sm">+ Add a kid</button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-gray-500">Calories
            <input type="number" className="w-full border rounded-xl p-2 mt-1" value={targets.target_calories}
              onChange={(e) => setTargets({ ...targets, target_calories: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-gray-500">Protein g
            <input type="number" className="w-full border rounded-xl p-2 mt-1" value={targets.target_protein}
              onChange={(e) => setTargets({ ...targets, target_protein: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-gray-500">Fiber g
            <input type="number" className="w-full border rounded-xl p-2 mt-1" value={targets.target_fiber}
              onChange={(e) => setTargets({ ...targets, target_fiber: Number(e.target.value) })} />
          </label>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={busy} className="w-full bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
          {busy ? 'Saving…' : 'Create household'}
        </button>
      </form>
    </div>
  )
}
