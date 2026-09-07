import { describe, expect, it } from 'vitest'
import { addMonth, addWeek, describeDue, dueOccurrences, nextDate } from '@/lib/recurring'

describe('stepping a week', () => {
  it('crosses month and year boundaries', () => {
    expect(addWeek('2026-09-01')).toBe('2026-09-08')
    expect(addWeek('2026-09-28')).toBe('2026-10-05')
    expect(addWeek('2026-12-29')).toBe('2027-01-05')
  })
})

describe('stepping a month', () => {
  it('keeps the same day where it exists', () => {
    expect(addMonth('2026-09-05')).toBe('2026-10-05')
    expect(addMonth('2026-12-15')).toBe('2027-01-15')
  })

  it('clamps to the end of a shorter month', () => {
    expect(addMonth('2026-01-31')).toBe('2026-02-28')
    expect(addMonth('2026-03-31')).toBe('2026-04-30')
  })

  it('handles a leap February', () => {
    expect(addMonth('2028-01-31')).toBe('2028-02-29')
  })

  it('returns to the original day after a clamp', () => {
    // Rent due on the 31st should not be stuck on the 28th forever.
    const feb = addMonth('2026-01-31')
    expect(feb).toBe('2026-02-28')
    expect(addMonth('2026-01-31')).toBe('2026-02-28')
    // Stepping from the anchor each time is what keeps the 31st.
    expect(nextDate('2026-03-31', 'monthly')).toBe('2026-04-30')
  })
})

describe('what has come due', () => {
  it('lists every missed month up to today', () => {
    expect(dueOccurrences('2026-06-01', 'monthly', ['2026-06-01'], '2026-09-07')).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ])
  })

  it('skips the ones already entered', () => {
    expect(
      dueOccurrences(
        '2026-06-01',
        'monthly',
        ['2026-06-01', '2026-07-01', '2026-09-01'],
        '2026-09-07',
      ),
    ).toEqual(['2026-08-01'])
  })

  it('offers nothing before the next one is due', () => {
    expect(dueOccurrences('2026-09-01', 'monthly', ['2026-09-01'], '2026-09-07')).toEqual([])
  })

  it('includes one falling exactly on today', () => {
    expect(dueOccurrences('2026-08-07', 'monthly', ['2026-08-07'], '2026-09-07')).toEqual([
      '2026-09-07',
    ])
  })

  it('does not run away on a long forgotten bill', () => {
    const due = dueOccurrences('2019-01-01', 'weekly', ['2019-01-01'], '2026-09-07', 24)
    expect(due).toHaveLength(24)
  })

  it('compares dates as text, so no timezone can shift a day', () => {
    // 1 September stays 1 September regardless of where this runs.
    expect(dueOccurrences('2026-08-01', 'monthly', ['2026-08-01'], '2026-09-01')).toEqual([
      '2026-09-01',
    ])
  })
})

describe('describing what is due', () => {
  it('counts in the right unit', () => {
    expect(describeDue(1, 'monthly')).toBe('1 month is due')
    expect(describeDue(3, 'monthly')).toBe('3 months are due')
    expect(describeDue(1, 'weekly')).toBe('1 week is due')
    expect(describeDue(2, 'weekly')).toBe('2 weeks are due')
  })
})
