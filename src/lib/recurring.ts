export type Repeat = 'weekly' | 'monthly'

export const REPEAT_LABELS: Record<Repeat, string> = {
  weekly: 'Every week',
  monthly: 'Every month',
}

/**
 * Dates are handled as plain `YYYY-MM-DD` strings throughout.
 *
 * A rent bill belongs to a calendar day, not an instant. Putting it through a
 * Date with a timezone is how "1 September" becomes "31 August" for anyone east
 * or west of wherever the code happened to run.
 */
function parse(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addWeek(date: string): string {
  const { year, month, day } = parse(date)
  const stepped = new Date(Date.UTC(year, month - 1, day + 7))
  return stepped.toISOString().slice(0, 10)
}

/**
 * The same day next month, clamped to the length of that month.
 *
 * Rent due on the 31st is due on the 28th of February, not the 3rd of March,
 * and it goes back to the 31st the month after rather than staying clamped.
 */
export function addMonth(date: string): string {
  const { year, month, day } = parse(date)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return format(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)))
}

export function nextDate(date: string, repeat: Repeat): string {
  return repeat === 'weekly' ? addWeek(date) : addMonth(date)
}

/**
 * Which repeats of a bill have come due and have not been entered yet.
 *
 * Nothing is created automatically. A bill that appears in your ledger without
 * you putting it there is a bill you have to check, and an app that invents
 * amounts is worse than one that asks. This returns dates to offer; adding them
 * stays a decision.
 *
 * `anchor` is the date the original bill is dated. `existing` is every date
 * already recorded for this series, including the original.
 */
export function dueOccurrences(
  anchor: string,
  repeat: Repeat,
  existing: readonly string[],
  today: string,
  limit = 24,
): string[] {
  const already = new Set(existing)
  const due: string[] = []

  let cursor = nextDate(anchor, repeat)
  let guard = 0

  while (cursor <= today && guard < limit) {
    if (!already.has(cursor)) due.push(cursor)
    cursor = nextDate(cursor, repeat)
    guard += 1
  }

  return due
}

/** "3 months of Rent are due" rather than a raw count. */
export function describeDue(count: number, repeat: Repeat): string {
  const unit = repeat === 'weekly' ? 'week' : 'month'
  return count === 1 ? `1 ${unit} is due` : `${count} ${unit}s are due`
}
