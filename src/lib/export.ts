import { formatMoney } from './format'
import { money, toMajorString } from './money'
import type { Expense, Person, Settlement } from './store/types'

/**
 * A group as a spreadsheet.
 *
 * Exporting is a Pro feature over there, which is a strange thing to charge
 * for: it is your own record of your own money. The layout mirrors the one
 * Splitwise exports, a column per person, so a file from here opens the same
 * way in the same tools.
 *
 * Amounts are written as plain decimal strings with no symbol or grouping,
 * because a spreadsheet should read them as numbers rather than text.
 */

/** RFC 4180: quote anything containing a comma, quote or newline. */
function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsvRow(values: string[]): string {
  return values.map(cell).join(',')
}

export interface ExportInput {
  groupName: string
  currency: string
  members: Person[]
  expenses: Expense[]
  settlements: Settlement[]
  nameOf: (personId: string) => string
}

export function buildGroupCsv(input: ExportInput): string {
  const { members, currency } = input

  const header = [
    'Date',
    'Description',
    'Category',
    'Total',
    'Currency',
    'Paid by',
    'Spent in',
    'Original amount',
    'Rate',
    ...members.map((m) => m.name),
  ]

  const rows = input.expenses
    .slice()
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
    .map((expense) => {
      const total = expense.shares.reduce((acc, s) => acc + BigInt(s.minor), 0n)
      const shareBy = new Map(expense.shares.map((s) => [s.personId, BigInt(s.minor)]))
      const paidBy = expense.payers
        .map(
          (p) =>
            `${input.nameOf(p.personId)} ${toMajorString(money(BigInt(p.minor), currency))}`,
        )
        .join('; ')

      return toCsvRow([
        expense.occurredOn,
        expense.description,
        expense.category,
        toMajorString(money(total, currency)),
        currency,
        paidBy,
        expense.original?.currency ?? '',
        expense.original
          ? toMajorString(money(BigInt(expense.original.minor), expense.original.currency))
          : '',
        expense.original?.rateToGroupCurrency ?? '',
        ...members.map((m) => toMajorString(money(shareBy.get(m.id) ?? 0n, currency))),
      ])
    })

  // Confirmed settlements belong in the record too: without them the columns
  // do not explain how a balance got back to zero.
  const settlementRows = input.settlements
    .filter((s) => s.status === 'confirmed')
    .map((s) =>
      toCsvRow([
        s.createdAt.slice(0, 10),
        `Settlement: ${input.nameOf(s.fromId)} paid ${input.nameOf(s.toId)}`,
        'Settlement',
        toMajorString(money(BigInt(s.minor), currency)),
        currency,
        input.nameOf(s.fromId),
        '',
        '',
        '',
        ...members.map(() => '0.00'),
      ]),
    )

  return [toCsvRow(header), ...rows, ...settlementRows].join('\r\n')
}

/** `Goa trip` becomes `baaki-goa-trip-2026-09-07.csv`. */
export function csvFilename(groupName: string, today = new Date()): string {
  const slug =
    groupName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'group'
  return `baaki-${slug}-${today.toISOString().slice(0, 10)}.csv`
}

/** A one line summary for the UI, so the button can say what it will produce. */
export function describeExport(expenses: number, settlements: number): string {
  const bills = `${expenses} ${expenses === 1 ? 'bill' : 'bills'}`
  if (settlements === 0) return bills
  return `${bills} and ${settlements} ${settlements === 1 ? 'settlement' : 'settlements'}`
}

export { formatMoney }
