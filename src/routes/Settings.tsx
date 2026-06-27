import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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
import Icon, { type IconName } from '../components/Icon'
import { ease } from '../components/motion'

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little exercise · 0.8 g protein/kg' },
  { value: 'moderate', label: 'Moderately active', hint: 'Some exercise · ~1.1 g/kg' },
  { value: 'strength', label: 'Strength training', hint: 'Regular lifting · ~1.8 g/kg' },
  { value: 'fat_loss', label: 'Fat loss, keep muscle', hint: 'High protein · ~2.0 g/kg' },
]

type View = 'menu' | 'reminders' | 'family' | 'pantry'

const SECTION_TITLES: Record<Exclude<View, 'menu'>, string> = {
  reminders: 'Reminders',
  family: 'Family & nutrition',
  pantry: 'Pantry staples',
}

// HH:MM:SS or HH:MM -> HH:MM for <input type="time">
function toTimeInput(value: string | undefined): string {
  if (!value) return ''
  return value.slice(0, 5)
}

export default function Settings() {
  const { householdId, settings, refresh } = useHousehold()
  const base = settings ?? defaultSettings()

  const [view, setView] = useState<View>('menu')

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

  const remindersSummary = pushState === 'granted'
    ? `On · evening ${evening || '—'} · morning ${morning || '—'}`
    : `Evening ${evening || '—'} · morning ${morning || '—'}`
  const familySummary = `${members.length} ${members.length === 1 ? 'person' : 'people'}`
  const pantrySummary = staples.length
    ? `${staples.length} ${staples.length === 1 ? 'staple' : 'staples'}`
    : 'None yet'

  return (
    <>
      <TopBar
        variant="back"
        title={view === 'menu' ? 'Settings' : SECTION_TITLES[view]}
        onBack={view === 'menu' ? undefined : () => setView('menu')}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: view === 'menu' ? -16 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: view === 'menu' ? 16 : -16 }}
          transition={{ duration: 0.26, ease }}
        >
          {view === 'menu' ? (
            <div className="screen pt-3">
              <p className="eyebrow">Your kitchen</p>
              <h1 className="mt-1 font-display text-title font-semibold text-ink">Settings</h1>

              <nav className="mt-7 space-y-3">
                <MenuRow icon="plan" tint="terracotta" title="Reminders"
                  summary={remindersSummary} onClick={() => setView('reminders')} />
                <MenuRow icon="today" tint="olive" title="Family & nutrition"
                  summary={familySummary} onClick={() => setView('family')} />
                <MenuRow icon="pantry" tint="terracotta" title="Pantry staples"
                  summary={pantrySummary} onClick={() => setView('pantry')} />
              </nav>

              <div className="mt-10 rule pt-5">
                <p className="eyebrow">Account</p>
                <button type="button" onClick={() => supabase.auth.signOut()}
                  className="mt-2 text-sm font-semibold text-red-600 transition-colors hover:text-red-700">
                  Sign out
                </button>
              </div>
            </div>
          ) : view === 'reminders' ? (
            <div className="screen space-y-7 pt-4">
              <SectionIntro
                eyebrow="Stay on track"
                title="Reminders"
                lead="Two gentle nudges a day — plan tomorrow in the evening, cook it the next morning." />

              <section className="rounded-2xl border border-ink/10 bg-bone-surface/50 p-4">
                <h2 className="eyebrow">On this device</h2>
                <div className="mt-3">
                  {pushState === 'needs-install' ? (
                    <p className="text-sm text-ink-soft">
                      To get reminders on iPhone, tap the Share button in Safari and choose
                      <span className="font-semibold"> “Add to Home Screen”</span>, then open the app from your home screen.
                    </p>
                  ) : pushState === 'unsupported' ? (
                    <p className="text-sm text-ink-soft">Reminders aren’t supported on this device/browser.</p>
                  ) : pushState === 'denied' ? (
                    <p className="text-sm text-ink-soft">Notifications are blocked. Enable them in your browser/OS settings, then return here.</p>
                  ) : pushState === 'granted' ? (
                    <p className="text-sm font-semibold text-olive-dark">Reminders are enabled on this device. ✓</p>
                  ) : (
                    <button type="button" onClick={handleEnablePush} disabled={pushBusy}
                      className="btn-primary text-[13px] disabled:opacity-50">
                      {pushBusy ? 'Enabling…' : 'Enable reminders'}
                    </button>
                  )}
                  {pushMsg && <p className="mt-2 text-sm text-ink-soft">{pushMsg}</p>}
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="eyebrow">Reminder times</h2>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-soft">Evening — plan tomorrow</span>
                  <input type="time" value={evening} onChange={(e) => setEvening(e.target.value)}
                    className="rounded-xl border border-ink/15 bg-bone-surface px-3 py-1.5 text-sm nums" />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-soft">Morning — cook today</span>
                  <input type="time" value={morning} onChange={(e) => setMorning(e.target.value)}
                    className="rounded-xl border border-ink/15 bg-bone-surface px-3 py-1.5 text-sm nums" />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-sm text-ink-soft">Timezone</span>
                  <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)}
                    placeholder="e.g. America/New_York"
                    className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-bone-surface px-3 py-1.5 text-sm" />
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                {saved && <p className="text-sm font-semibold text-olive-dark">Saved ✓</p>}
                <button type="button" onClick={handleSave} disabled={saving}
                  className="btn-primary w-full text-[14px] disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save reminder times'}
                </button>
              </section>
            </div>
          ) : view === 'family' ? (
            <div className="screen space-y-5 pt-4">
              <SectionIntro
                eyebrow="Who you cook for"
                title="Family & nutrition"
                lead="Targets are computed for each person. Fine-tune any value below; clear a field to return to the computed number." />

              {members.map((m) => {
                const computed = computeTargets(m)
                const kid = isKid(m)
                return (
                  <div key={m.id} className="rounded-2xl border border-ink/10 bg-bone-surface/50 p-4 shadow-soft space-y-3">
                    <div className="flex items-center gap-2">
                      <input className="flex-1 rounded-xl border border-ink/15 bg-bone-surface p-2.5 font-display text-[16px] text-ink" aria-label="Member name"
                        value={m.name ?? ''} placeholder="Name"
                        onChange={(e) => patchMember(m.id, { name: e.target.value })} />
                      <button type="button" aria-label="Remove member"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-red-50 hover:text-red-500"
                        onClick={() => handleRemoveMember(m.id)}>✕</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-xs text-ink-soft">Sex
                        <select className="mt-1 w-full rounded-xl border border-ink/15 bg-bone-surface p-2" aria-label="Member sex"
                          value={m.sex} onChange={(e) => patchMember(m.id, { sex: e.target.value as Sex })}>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      </label>
                      <label className="text-xs text-ink-soft">Age
                        <input type="number" min={0} max={129} className="mt-1 w-full rounded-xl border border-ink/15 bg-bone-surface p-2 nums" aria-label="Member age"
                          value={m.age} onChange={(e) => patchMember(m.id, { age: Number(e.target.value) || 0 })} />
                      </label>
                      <label className="text-xs text-ink-soft">Weight (kg)
                        <input type="number" min={1} className="mt-1 w-full rounded-xl border border-ink/15 bg-bone-surface p-2 nums" aria-label="Member weight"
                          value={m.weightKg} onChange={(e) => patchMember(m.id, { weightKg: Number(e.target.value) || 0 })} />
                      </label>
                    </div>
                    {!kid && (
                      <label className="block text-xs text-ink-soft">Activity / goal
                        <select className="mt-1 w-full rounded-xl border border-ink/15 bg-bone-surface p-2" aria-label="Member activity"
                          value={m.activity} onChange={(e) => patchMember(m.id, { activity: e.target.value as ActivityLevel })}>
                          {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <span className="text-[11px] text-ink-faint">{ACTIVITY_OPTIONS.find((o) => o.value === m.activity)?.hint}</span>
                        <button type="button" className="mt-1 block text-[11px] font-semibold text-terracotta"
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
                    {kid && <p className="text-[11px] text-ink-faint">Under 18 — pediatric growth targets.</p>}

                    <details className="group">
                      <summary className="cursor-pointer text-xs font-semibold text-terracotta">Fine-tune targets</summary>
                      {NUTRIENT_GROUPS.map((group) => (
                        <div key={group}>
                          <p className="mt-3 text-[11px] font-semibold uppercase tracking-eyebrow text-ink-faint">{GROUP_LABELS[group]}</p>
                          <div className="mt-1 grid grid-cols-3 gap-2">
                            {NUTRIENTS.filter((n) => n.group === group).map((n) => (
                              <label key={n.key} className="text-xs text-ink-soft">{n.label} {n.unit && `(${n.unit})`}
                                <input type="number" className="mt-1 w-full rounded-xl border border-ink/15 bg-bone-surface p-2 nums" aria-label={`${m.name ?? 'member'} ${n.label}`}
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
                      className="btn-primary w-full text-[13px]">Save {m.name || 'member'}</button>
                  </div>
                )
              })}

              <button type="button" onClick={handleAddMember}
                className="btn-ghost w-full text-[14px]">
                <Icon name="plus" size={16} strokeWidth={1.8} /> Add a family member
              </button>
              {memberMsg && <p className="text-sm text-ink-soft">{memberMsg}</p>}
            </div>
          ) : (
            <div className="screen space-y-5 pt-4">
              <SectionIntro
                eyebrow="Always in the cupboard"
                title="Pantry staples"
                lead="Items you always have on hand. These never show up in your shopping list." />

              <div className="flex flex-wrap gap-1.5">
                {staples.map((s) => (
                  <span key={s.id}
                    className="flex items-center gap-1.5 rounded-full bg-terracotta-soft px-3 py-1 text-[13px] text-ink">
                    {s.name}
                    <button type="button" aria-label={`Remove ${s.name}`}
                      onClick={() => handleRemoveStaple(s.id)} className="text-ink-faint transition-colors hover:text-terracotta-dark">✕</button>
                  </span>
                ))}
                {staples.length === 0 && <span className="text-sm text-ink-faint">No staples yet.</span>}
              </div>
              <div className="flex gap-2">
                <input value={newStaple} onChange={(e) => setNewStaple(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddStaple() } }}
                  aria-label="New staple" placeholder="e.g. salt"
                  className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-bone-surface px-3 py-2 text-sm" />
                <button type="button" onClick={handleAddStaple}
                  className="btn-primary shrink-0 text-[13px]">Add</button>
              </div>
              {stapleError && <p className="text-sm text-red-600">{stapleError}</p>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function MenuRow({ icon, tint, title, summary, onClick }: {
  icon: IconName
  tint: 'terracotta' | 'olive'
  title: string
  summary: string
  onClick: () => void
}) {
  const tintClass = tint === 'terracotta' ? 'bg-terracotta-soft text-terracotta-dark' : 'bg-olive-soft text-olive-dark'
  return (
    <button type="button" onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border border-ink/10 bg-bone-surface/50 p-4 text-left shadow-soft transition-colors hover:bg-bone-surface">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tintClass}`}>
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[18px] leading-tight text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-soft">{summary}</span>
      </span>
      <span className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5">
        <Icon name="chevron" size={18} strokeWidth={1.8} />
      </span>
    </button>
  )
}

function SectionIntro({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lead}</p>
    </div>
  )
}
