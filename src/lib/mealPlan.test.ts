import { describe, it, expect } from 'vitest'
import { addDays, nextWeekStartDate, planDays, weekStartDate, todayDate } from './mealPlan'

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-06-21', 1)).toBe('2026-06-22')
  })
  it('crosses a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
  })
  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('nextWeekStartDate', () => {
  it('is exactly 7 days after the week start', () => {
    const d = new Date('2026-06-21T12:00:00Z')
    expect(nextWeekStartDate(d)).toBe(addDays(weekStartDate(d), 7))
  })
})

describe('planDays', () => {
  const days = planDays(new Date('2026-06-21T12:00:00Z'))
  it('returns 14 entries starting today', () => {
    expect(days).toHaveLength(14)
    expect(days[0]).toEqual({ date: '2026-06-21', label: 'Today' })
    expect(days[1]).toEqual({ date: '2026-06-22', label: 'Tomorrow' })
  })
  it('labels later days with weekday + day-of-month (UTC)', () => {
    // 2026-06-23 is a Tuesday
    expect(days[2]).toEqual({ date: '2026-06-23', label: 'Tue 23' })
  })
})

describe('weekStartDate serialization is local-consistent', () => {
  it('does not depend on the time-of-day component (same local day → same week start)', () => {
    // A late-evening and an early-morning instant on the SAME local calendar day
    // must yield the same week_start. (Before the fix, UTC serialization could differ.)
    const morning = new Date(2026, 5, 22, 1, 0, 0)   // local Jun 22 2026, 01:00
    const evening = new Date(2026, 5, 22, 23, 0, 0)  // local Jun 22 2026, 23:00
    expect(weekStartDate(morning)).toBe(weekStartDate(evening))
  })
  it('weekStartDate(now) agrees with weekStartDate(midnight of today) — the Pool vs Days invariant', () => {
    const now = new Date()
    const midnightOfToday = new Date(todayDate() + 'T00:00:00')
    expect(weekStartDate(now)).toBe(weekStartDate(midnightOfToday))
  })
})
