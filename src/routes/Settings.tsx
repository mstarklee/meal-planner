import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHousehold } from '../context/HouseholdProvider'
import { supabase } from '../lib/supabase'
import { defaultTargets } from '../lib/householdDefaults'
import { updateReminderSettings, browserTimezone } from '../lib/settingsData'
import { enablePush, getPushState, type PushState } from '../lib/push'
import { getStaples, addStaple, removeStaple, type Staple } from '../lib/staples'

// HH:MM:SS or HH:MM -> HH:MM for <input type="time">
function toTimeInput(value: string | undefined): string {
  if (!value) return ''
  return value.slice(0, 5)
}

export default function Settings() {
  const navigate = useNavigate()
  const { householdId, settings, refresh } = useHousehold()
  const base = settings ?? defaultTargets()

  const [evening, setEvening] = useState(toTimeInput(base.evening_reminder_time))
  const [morning, setMorning] = useState(toTimeInput(base.morning_reminder_time))
  const [timezone, setTimezone] = useState(base.timezone && base.timezone !== 'UTC' ? base.timezone : browserTimezone())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pushState, setPushState] = useState<PushState>('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  const [staples, setStaples] = useState<Staple[]>([])
  const [newStaple, setNewStaple] = useState('')
  const [stapleError, setStapleError] = useState<string | null>(null)

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
    <div className="px-4 pt-6 pb-10 space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-brand text-xl">←</button>
        <h1 className="text-2xl font-bold text-brand">Settings</h1>
      </div>

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
  )
}
