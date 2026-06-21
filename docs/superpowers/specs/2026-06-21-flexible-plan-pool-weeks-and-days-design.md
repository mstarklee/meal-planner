# Flexible Plan — Pool Weeks + Any-Day Picks — Design

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation plan

## Problem

The Plan screen is too rigid. The **Pool** tab only shows the *current* week, and
the **Plan Tomorrow** tab only lets you assign meals for *tomorrow*, with an
all-or-nothing "lock in". Users want to organize ahead and adjust on the fly:
view and stock **this week's** and **next week's** pools, and assign or change
meals for **any day** across those two weeks — especially to **alter today's
menu** when plans change.

## Goal

Make the Plan screen flexible:
- **Pool** tab can stock either **This Week** or **Next Week**.
- **Days** tab can assign meals for **any day** in this + next week (a 14-day
  range starting today), drawing from the pool of that day's week.
- Picking/changing a meal **saves immediately** per slot (tap to set, tap again
  to clear) — no all-or-nothing lock-in.

## Decisions (settled during brainstorming)

1. **Day scope:** any day across this + next week (today → today+13), via a
   horizontal date strip.
2. **Save behavior:** immediate per-meal save (no "Save day" button, no
   require-all-slots).
3. **Layout:** keep two tabs — **Pool** (with This Week / Next Week toggle) and
   **Days** (date strip), replacing the old "This Week's Pool" / "Plan Tomorrow".
4. **No database migration.** The schema already supports any `week_start` and any
   `pick_date`. `daily_picks` has `unique(household_id, slot, pick_date)`.

## Key data-model fact

`daily_picks` RLS has **insert/select/delete only — no UPDATE policy**
(`supabase/migrations/0004_meal_plans.sql`). Therefore an upsert/`onConflict`
update would fail RLS. Per-meal save is implemented as **delete-then-insert** for
the `(household_id, slot, pick_date)` row, which works with the existing policies.

## Components & data flow

### `src/routes/Plan.tsx`
- Tab labels become **Pool** and **Days**. `PlanMode` becomes `'pool' | 'days'`.
- Renders `<PoolManager />` and the new `<PlanDays />`.

### `src/components/PoolManager.tsx` (Pool tab)
- Add a **This Week / Next Week** toggle above the slot tabs.
- New state `week: string` defaulting to `weekStartDate()` (this week); the toggle
  switches between `weekStartDate()` and `nextWeekStartDate()`.
- `getPool`, `addToPool`, `removeFromPool` already take `weekStart` — pass the
  selected `week`. The load effect depends on `[householdId, slot, week]`.
- Slot tabs, target counter, and recipe grid otherwise unchanged.

### `src/components/PlanDays.tsx` (new — replaces `PlanTomorrow.tsx`)
- A horizontal **date strip** built from `planDays()` (14 entries: today → +13).
  Each chip shows a label ("Today", "Tomorrow", else weekday + day-of-month).
  Selected day is highlighted; defaults to today.
- For the selected `date`, derive `week = weekStartDate(new Date(date))` and load
  that week's full pool (`getFullPool`) plus that day's picks
  (`getPicksForDate`). Reload when the selected date changes.
- Pick slots: `PICK_SLOTS` filtered to drop kid slots when `kids.length === 0`
  (same rule as today). For each slot, render a horizontal carousel of the pool
  entries for `poolSlotFor(slot)`. The currently-picked recipe is highlighted.
- **Tap behavior (immediate save):**
  - Tap an unselected recipe → `setPick(householdId, recipe_id, slot, date)`,
    optimistically update local pick state, rollback + show error on failure.
  - Tap the currently-picked recipe → `clearPick(householdId, slot, date)`,
    optimistic update with rollback on failure.
- Empty-pool-for-slot state: "No recipes in this week's pool — add some in the
  Pool tab." (No lock-in button anywhere.)

### `src/lib/mealPlans.ts`
- **Remove** `lockInTomorrow` (only consumer is `PlanTomorrow`, being deleted).
- Add:
  ```ts
  export async function setPick(
    householdId: string, recipeId: string, slot: PickSlot, date: string,
  ): Promise<void> {
    const { error: delErr } = await supabase
      .from('daily_picks').delete()
      .eq('household_id', householdId).eq('slot', slot).eq('pick_date', date)
    if (delErr) throw delErr
    const { error } = await supabase
      .from('daily_picks')
      .insert({ household_id: householdId, recipe_id: recipeId, slot, pick_date: date })
    if (error) throw error
  }

  export async function clearPick(
    householdId: string, slot: PickSlot, date: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('daily_picks').delete()
      .eq('household_id', householdId).eq('slot', slot).eq('pick_date', date)
    if (error) throw error
  }
  ```
- `getFullPool` and `getPicksForDate` are unchanged (already parameterized).

### `src/lib/mealPlan.ts`
- Add `nextWeekStartDate(d?: Date): string` → `weekStartDate(d)` + 7 days.
- Add `addDays(dateStr: string, n: number): string`.
- Add `planDays(today?: Date): { date: string; label: string }[]` → 14 entries
  starting today; labels: index 0 → "Today", index 1 → "Tomorrow", else a short
  weekday + day (e.g. "Wed 25"). Pure and deterministic given the input date.

### `src/routes/Today.tsx`
- Add a small **"Edit"** link (to the Days tab with today selected) so altering
  today's menu is one tap from the home screen. Navigation target: the Plan route
  with the Days tab active and today's date selected (via router state — see
  Navigation detail below). Display logic otherwise unchanged.

## Navigation detail (Today → Days)

`Plan.tsx` accepts an optional initial mode + selected date so the Today "Edit"
link can deep-link into Days on today. Implement with router state
(`navigate('/plan', { state: { mode: 'days', date: todayDate() } })`) read once on
mount; fall back to defaults (`mode='pool'`… or keep current default) when absent.
Default tab when opening Plan normally stays **Pool** (unchanged behavior).

## Error handling & edge cases

- Per-meal save: optimistic update + rollback + inline error (mirrors
  `PoolManager.toggle`).
- A next-week day automatically pulls from next-week's pool via
  `weekStartDate(selectedDay)`.
- Empty week pool for a slot → guidance text pointing to the Pool tab.
- Kid slots hidden when the household has no kids (existing rule preserved).

## Affected files

- Modify: `src/routes/Plan.tsx` (tabs, optional deep-link state)
- Modify: `src/components/PoolManager.tsx` (week toggle)
- Create: `src/components/PlanDays.tsx`
- Delete: `src/components/PlanTomorrow.tsx`
- Modify: `src/lib/mealPlans.ts` (remove `lockInTomorrow`; add `setPick`, `clearPick`)
- Modify: `src/lib/mealPlan.ts` (`nextWeekStartDate`, `addDays`, `planDays`)
- Modify: `src/routes/Today.tsx` ("Edit" deep-link)
- Create: `src/lib/mealPlan.test.ts` (date-helper unit tests)

## Out of scope / YAGNI

- Per-day nutrition rollup in the Days tab (Today already shows today's totals).
- Editing days beyond next week / a full calendar.
- A "Save day" / lock-in flow (replaced by immediate save).
- Any backend / migration changes.
- Bulk "copy last week's pool" or auto-fill.

## Testing

- `mealPlan.test.ts`: `nextWeekStartDate` (Monday-anchored, +7), `addDays`
  (incl. month/year boundaries), `planDays` (14 entries, "Today"/"Tomorrow"
  labels, correct dates) — all with an injected fixed date, no reliance on the
  real clock.
- `setPick`/`clearPick`: thin Supabase wrappers, consistent with the existing
  untested data wrappers in `mealPlans.ts`/`pantryData.ts`; covered by manual
  end-to-end verification rather than unit tests (no mock harness exists for these
  today). The plan may add a light mock-based test if low-cost.
- Manual E2E (after deploy/local run): toggle Pool weeks; stock next week; on Days
  tab pick across multiple days incl. a next-week day; change today's menu and see
  it reflected on the Today screen.
