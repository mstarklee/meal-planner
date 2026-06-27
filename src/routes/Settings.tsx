import { useEffect, useState } from 'react'
import { useHousehold } from '../context/HouseholdProvider'
import { supabase } from '../lib/supabase'
import { defaultSettings } from '../lib/householdDefaults'
import { NUTRIENTS, GROUP_LABELS, NUTRIENT_GROUPS } from '../lib/nutrients'
import { updateReminderSettings, browserTimezone } from '../lib/settingsData'
import { getMembers, addMember, updateMember, removeMember } from '../lib/memberData'
import { computeTargets, isKid, type ActivityLevel, type Member, type Sex } from '../lib/nutritionTargets'
import { enablePush, getPushState, type PushState } from '../lib/push'
import { suggestActivity } from '../lib/activityAssist'
import { getStaples, addStaple, removeStaple, type Staple } from '../lib/staples'
import TopBar from '../components/TopBar'

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little exercise · 0.8 g protein/kg' },
  { value: 'moderate', label: 'Moderately active', hint: 'Some exercise · ~1.1 g/kg' },
  { value: 'strength', label: 'Strength training', hint: 'Regular lifting · ~1.8 g/kg' },
  { value: 'fat_loss', label: 'Fat loss, keep muscle', hint: 'High protein · ~2.0 g/kg' },
]

// HH:MM:SS or HH:MM -> HH:MM for <input type="time">
function toTimeInput(value: string | undefined): string {
  if (!value) return ''
  return value.slice(0, 5)
}

export default function Settings() {
  const { householdId, settings, refresh } = useHousehold()
  const base = settings ?? defaultSettings()

  const [evening, setEvening] = useState(toTimeInput(base.evening_reminder_time))
  const [morning, setMorning] = useState(toTimeInput(base.morning_reminder_time))
  const [timezone, setTimezone] = useState(base.timezone && base.timezone !== 'UTC' ? base.timezone : browserTimezone())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [members, setMembers] = useState<Member[]>([])
  const [memberMsg, setMemberMsg] = useState<string | null>(null)

  const [pushState, setPushState] = useState<PushState>('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  const [staples, setStaples] = useState<Staple[]>([])
  const [newStaple, setNewStaple] = useState('')
  const [stapleError, setStapleError] = useState<string | null>(null)

  useEffect(() => {
    if (!householdId) return
    void getMembers(householdId).then(setMembers).catch(() => undefined)
  }, [householdId])

  function patchMember(id: string, patch: Partial<Member>) {
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  async function saveMember(m: Member) {
    setMemberMsg(null)
    try {
      await updateMember(m.id, {
        name: m.name, sex: m.sex, age: m.age, weight_kg: m.weightKg,
        activity_level: m.activity, overrides: m.overrides,
      })
      await refresh()
      setMemberMsg('Saved ✓')
    } catch (e) {
      setMemberMsg(e instanceof Error ? e.message : 'Could not save member')
    }
  }

  async function handleAddMember() {
    if (!householdId) return
    try {
      const created = await addMember(householdId, {
        name: '', sex: 'female', age: 30, weight_kg: 60, activity_level: 'moderate',
      })
      setMembers([...members, created])
      await refresh()
    } catch (e) {
      setMemberMsg(e instanceof Error ? e.message : 'Could not add member')
    }
  }

  async function handleRemoveMember(id: string) {
    if (members.length <= 1) { setMemberMsg('Keep at least one member'); return }
    try {
      await removeMember(id)
      setMembers(members.filter((m) => m.id !== id))
      await refresh()
    } catch (e) {
      setMemberMsg(e instanceof Error ? e.message : 'Could not remove member')
    }
  }

  function setOverride(id: string, key: string, raw: string) {
    setMembers((ms) => ms.map((m) => {
      if (m.id !== id) return m
      const overrides = { ...m.overrides }
      const n = Number(raw)
      if (raw.trim() === '' || !Number.isFinite(n)) delete overrides[key]
      else overrides[key] = n
      return { ...m, overrides }
    }))
  }

  useEffect(() => { void getPushState().then(setPushState) }, [])

  useEffect(() => {
    if (!householdId) return
    void getStaples(householdId).then(setStaples).catch(() => undefined)
  }, [householdId])

  async function handleSave() {
    if (!householdId) return
    setSaving(true); setError(null); setSaved(false)
    try {
      await updateReminderSettings(householdId, {
        evening_reminder_time: evening, morning_reminder_time: morning, timezone,
      })
      await refresh()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleEnablePush() {
    setPushBusy(true); setPushMsg(null)
    try {
      const ok = await enablePush()
      setPushMsg(ok ? 'Reminders enabled on this device.' : 'Permission was not granted.')
      setPushState(await getPushState())
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : 'Could not enable reminders')
    } finally {
      setPushBusy(false)
    }
  }

  async function handleAddStaple() {
    const name = newStaple.trim()
    if (!householdId || !name) return
    setStapleError(null)
    if (staples.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setStapleError('Already in your staples'); return
    }
    try {
      const created = await addStaple(householdId, name)
      setStaples([...staples, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewStaple('')
    } catch (e) {
      setStapleError(e instanceof Error ? e.message : 'Could not add')
    }
  }

  async function handleRemoveStaple(id: string) {
    try {
      await removeStaple(id)
      setStaples(staples.filter((s) => s.id !== id))
    } catch (e) {
      setStapleError(e instanceof Error ? e.message : 'Could not remove')
    }
  }

  return (
    <>
      <TopBar variant="back" title="Settings" />
      <div className="screen space-y-6 pt-3">

      {/* Notifications */}
      <section className="space-y-2">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Reminders</h2>
        {pushState === 'needs-install' ? (
          <p className="text-sm text-gray-500">
            To get reminders on iPhone, tap the Share button in Safari and choose
            <span className="font-semibold"> "Add to Home Screen"</span>, then open the app from your home screen.
          </p>
        ) : pushState === 'unsupported' ? (
          <p className="text-sm text-gray-500">Reminders aren't supported on this device/browser.</p>
        ) : pushState === 'denied' ? (
          <p className="text-sm text-gray-500">Notifications are blocked. Enable them in your browser/OS settings, then return here.</p>
        ) : pushState === 'granted' ? (
          <p className="text-sm text-brand font-semibold">Reminders are enabled on this device. ✓</p>
        ) : (
          <button type="button" onClick={handleEnablePush} disabled={pushBusy}
            className="bg-brand text-white font-bold rounded-xl px-4 py-2 text-sm disabled:opacity-50">
            {pushBusy ? 'Enabling…' : 'Enable reminders'}
          </button>
        )}
        {pushMsg && <p className="text-sm text-gray-500">{pushMsg}</p>}
      </section>

      {/* Reminder times */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Reminder times</h2>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Evening — plan tomorrow</span>
          <input type="time" value={evening} onChange={(e) => setEvening(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Morning — cook today</span>
          <input type="time" value={morning} onChange={(e) => setMorning(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-700">Timezone</span>
          <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. America/New_York"
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm flex-1 min-w-0" />
        </label>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {saved && <p className="text-brand text-sm font-semibold">Saved ✓</p>}
        <button type="button" onClick={handleSave} disabled={saving}
          className="w-full bg-brand text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </section>

      {/* Family members & nutrition targets */}
      <section className="space-y-3 pt-2 border-t border-gray-100">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Family members</h2>
        <p className="text-sm text-gray-500">Targets are computed from each person. Fine-tune any value below; clear a field to go back to the computed number.</p>

        {members.map((m) => {
          const computed = computeTargets(m)
          const kid = isKid(m)
          return (
            <div key={m.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex gap-2 items-center">
                <input className="flex-1 border rounded-lg p-2 text-sm" aria-label="Member name"
                  value={m.name ?? ''} placeholder="Name"
                  onChange={(e) => patchMember(m.id, { name: e.target.value })} />
                <button type="button" aria-label="Remove member" className="px-2 text-red-500"
                  onClick={() => handleRemoveMember(m.id)}>✕</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-gray-500">Sex
                  <select className="w-full border rounded-lg p-2 mt-1" aria-label="Member sex"
                    value={m.sex} onChange={(e) => patchMember(m.id, { sex: e.target.value as Sex })}>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">Age
                  <input type="number" min={0} max={129} className="w-full border rounded-lg p-2 mt-1" aria-label="Member age"
                    value={m.age} onChange={(e) => patchMember(m.id, { age: Number(e.target.value) || 0 })} />
                </label>
                <label className="text-xs text-gray-500">Weight (kg)
                  <input type="number" min={1} className="w-full border rounded-lg p-2 mt-1" aria-label="Member weight"
                    value={m.weightKg} onChange={(e) => patchMember(m.id, { weightKg: Number(e.target.value) || 0 })} />
                </label>
              </div>
              {!kid && (
                <label className="text-xs text-gray-500 block">Activity / goal
                  <select className="w-full border rounded-lg p-2 mt-1" aria-label="Member activity"
                    value={m.activity} onChange={(e) => patchMember(m.id, { activity: e.target.value as ActivityLevel })}>
                    {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span className="text-[11px] text-gray-400">{ACTIVITY_OPTIONS.find((o) => o.value === m.activity)?.hint}</span>
                  <button type="button" className="mt-1 text-[11px] font-semibold text-brand block"
                    onClick={async () => {
                      const freq = Number(window.prompt('How many days a week do you train? (0-7)') ?? '')
                      const goalRaw = (window.prompt('Goal? type: maintain / build_muscle / lose_fat') ?? '').trim()
                      const goal = (['maintain','build_muscle','lose_fat'].includes(goalRaw) ? goalRaw : 'maintain') as 'maintain' | 'build_muscle' | 'lose_fat'
                      try {
                        const { level } = await suggestActivity({ trainsPerWeek: Number.isFinite(freq) ? freq : 0, goal })
                        patchMember(m.id, { activity: level })
                        setMemberMsg('Suggested an activity level — review and Save.')
                      } catch (e) { setMemberMsg(e instanceof Error ? e.message : 'Could not suggest') }
                    }}>Not sure? Let AI help</button>
                </label>
              )}
              {kid && <p className="text-[11px] text-gray-400">Under 18 — pediatric growth targets.</p>}

              <details>
                <summary className="cursor-pointer text-xs font-semibold text-brand">Fine-tune targets</summary>
                {NUTRIENT_GROUPS.map((group) => (
                  <div key={group}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-2">{GROUP_LABELS[group]}</p>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {NUTRIENTS.filter((n) => n.group === group).map((n) => (
                        <label key={n.key} className="text-xs text-gray-500">{n.label} {n.unit && `(${n.unit})`}
                          <input type="number" className="w-full border rounded-xl p-2 mt-1" aria-label={`${m.name ?? 'member'} ${n.label}`}
                            placeholder={String(computed[n.key] ?? '')}
                            value={typeof m.overrides[n.key] === 'number' ? (m.overrides[n.key] as number) : ''}
                            onChange={(e) => setOverride(m.id, n.key, e.target.value)} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </details>

              <button type="button" onClick={() => saveMember(m)}
                className="w-full bg-brand text-white font-bold rounded-xl py-2 text-sm">Save {m.name || 'member'}</button>
            </div>
          )
        })}

        <button type="button" onClick={handleAddMember} className="text-brand font-semibold text-sm">+ Add a family member</button>
        {memberMsg && <p className="text-sm text-gray-500">{memberMsg}</p>}
      </section>

      {/* Pantry staples */}
      <section className="space-y-2 pt-2 border-t border-gray-100">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Pantry staples</h2>
        <p className="text-sm text-gray-500">
          Always-available items. These never show up in your shopping list.
        </p>
        <div className="flex flex-wrap gap-1">
          {staples.map((s) => (
            <span key={s.id}
              className="text-xs px-2 py-1 rounded-full bg-brand-soft text-gray-700 flex items-center gap-1">
              {s.name}
              <button type="button" aria-label={`Remove ${s.name}`}
                onClick={() => handleRemoveStaple(s.id)} className="text-gray-400">✕</button>
            </span>
          ))}
          {staples.length === 0 && <span className="text-sm text-gray-400">No staples yet.</span>}
        </div>
        <div className="flex gap-2">
          <input value={newStaple} onChange={(e) => setNewStaple(e.target.value)}
            aria-label="New staple" placeholder="e.g. salt"
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm" />
          <button type="button" onClick={handleAddStaple}
            className="bg-brand text-white font-bold rounded-lg px-3 py-1 text-sm">Add</button>
        </div>
        {stapleError && <p className="text-red-600 text-sm">{stapleError}</p>}
      </section>

      {/* Account */}
      <section className="space-y-2 pt-2 border-t border-gray-100">
        <h2 className="text-xs font-bold text-gray-400 uppercase">Account</h2>
        <button type="button" onClick={() => supabase.auth.signOut()}
          className="text-sm text-red-600 font-semibold">Sign out</button>
      </section>
      </div>
    </>
  )
}
