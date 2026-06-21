import { describe, it, expect } from 'vitest'
import { addDays, nextWeekStartDate, planDays, weekStartDate } from './mealPlan'

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
