import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useHousehold } from '../context/HouseholdProvider'
import { defaultSettings } from '../lib/householdDefaults'
import { onboardingSchema, type MemberFormValue } from '../lib/onboardingSchema'
import type { ActivityLevel, Sex } from '../lib/nutritionTargets'
import { isKid } from '../lib/nutritionTargets'

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little exercise · 0.8 g protein/kg' },
  { value: 'moderate', label: 'Moderately active', hint: 'Some exercise · ~1.1 g/kg' },
  { value: 'strength', label: 'Strength training', hint: 'Regular lifting · ~1.8 g/kg' },
  { value: 'fat_loss', label: 'Fat loss, keep muscle', hint: 'High protein · ~2.0 g/kg' },
]

type Row = MemberFormValue & { key: string }

function blankMember(): Row {
  return { key: crypto.randomUUID(), name: '', sex: 'female', age: 30, weight_kg: 60, activity_level: 'moderate' }
}

export default function Onboarding() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { refresh } = useHousehold()
  const reminders = defaultSettings()
  const [householdName, setHouseholdName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [members, setMembers] = useState<Row[]>([blankMember()])
  const [evening, setEvening] = useState(reminders.evening_reminder_time)
  const [morning, setMorning] = useState(reminders.morning_reminder_time)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function addMember() { setMembers([...members, blankMember()]) }
  function removeMember(i: number) { setMembers(members.filter((_, idx) => idx !== i)) }
  function setMember(i: number, patch: Partial<Row>) {
    setMembers(members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      householdName, displayName,
      members: members.map(({ key: _key, ...m }) => m),
      evening_reminder_time: evening, morning_reminder_time: morning,
    }
    const parsed = onboardingSchema.safeParse(payload)
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    if (!session) { setError('Not signed in'); return }
    setBusy(true)
    const { data: newId, error } = await supabase.rpc('create_household_with_setup', {
      p_name: householdName,
      p_display_name: displayName,
      p_members: parsed.data.members,
      p_evening: evening,
      p_morning: morning,
    })
    if (error || !newId) { setBusy(false); setError(error?.message ?? 'Failed to set up household'); return }
    await refresh()
    setBusy(false)
    nav('/')
  }

  return (
    <div className="min-h-screen px-6 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-brand mb-1">Set up your household</h1>
      <p className="text-gray-500 mb-6">Add each family member so we can tailor nutrition to them. You can change all of this later.</p>
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

        <div className="space-y-3">
          <label className="text-xs font-bold text-gray-500 uppercase">Family members</label>
          {members.map((m, i) => (
            <div key={m.key} className="rounded-xl border p-3 space-y-2">
              <div className="flex gap-2">
                <input className="flex-1 border rounded-lg p-2" aria-label={`Member ${i + 1} name`}
                  value={m.name} onChange={(e) => setMember(i, { name: e.target.value })} placeholder="Name (optional)" />
                {members.length > 1 && (
                  <button type="button" aria-label={`Remove member ${i + 1}`}
                    className="px-3 text-red-500" onClick={() => removeMember(i)}>✕</button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-gray-500">Sex
                  <select className="w-full border rounded-lg p-2 mt-1" aria-label={`Member ${i + 1} sex`}
                    value={m.sex} onChange={(e) => setMember(i, { sex: e.target.value as Sex })}>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">Age
                  <input type="number" min={0} max={129} className="w-full border rounded-lg p-2 mt-1"
                    aria-label={`Member ${i + 1} age`} value={m.age}
                    onChange={(e) => setMember(i, { age: Number(e.target.value) || 0 })} />
                </label>
                <label className="text-xs text-gray-500">Weight (kg)
                  <input type="number" min={1} className="w-full border rounded-lg p-2 mt-1"
                    aria-label={`Member ${i + 1} weight`} value={m.weight_kg}
                    onChange={(e) => setMember(i, { weight_kg: Number(e.target.value) || 0 })} />
                </label>
              </div>
              {!isKid({ age: m.age }) && (
                <label className="text-xs text-gray-500 block">Activity / goal
                  <select className="w-full border rounded-lg p-2 mt-1" aria-label={`Member ${i + 1} activity`}
                    value={m.activity_level} onChange={(e) => setMember(i, { activity_level: e.target.value as ActivityLevel })}>
                    {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span className="text-[11px] text-gray-400">{ACTIVITY_OPTIONS.find((o) => o.value === m.activity_level)?.hint}</span>
                </label>
              )}
              {isKid({ age: m.age }) && (
                <p className="text-[11px] text-gray-400">Under 18 — targets use growth-based pediatric values.</p>
              )}
            </div>
          ))}
          <button type="button" onClick={addMember} className="text-brand font-semibold text-sm">+ Add a family member</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500">Evening reminder
            <input type="time" aria-label="Evening reminder time"
              className="w-full border rounded-xl p-2 mt-1" value={evening}
              onChange={(e) => setEvening(e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">Morning reminder
            <input type="time" aria-label="Morning reminder time"
              className="w-full border rounded-xl p-2 mt-1" value={morning}
              onChange={(e) => setMorning(e.target.value)} />
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
