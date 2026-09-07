import { fromMajor, money, type Money } from './money'

/**
 * Read a group exported from Splitwise.
 *
 * Their export is one file per group: `Date,Description,Category,Cost,Currency`
 * followed by a column per member, and a trailing row of total balances. Each
 * person's cell is what they came out by on that bill, paid minus owed, so an
 * evenly split 100 that Alice paid reads +50 for Alice and -50 for Bob.
 *
 * That is enough to reproduce every balance exactly, which is the thing that
 * has to survive a move. It is not enough to always recover how the bill was
 * divided: a person who paid exactly their share and a person who was not on
 * the bill both read as zero. Where the split cannot be recovered, this says
 * so rather than inventing one.
 */

export interface ImportedRow {
  date: string
  description: string
  category: string
  cost: Money
  /** Paid minus owed, per person, in the order of `people`. */
  nets: bigint[]
  /**
   * False when the split had to be reconstructed from the balances alone
   * because an even split would have required somebody to pay a negative
   * amount. Balances are still exact; the shares are a stand-in.
   */
  splitRecovered: boolean
  payers: { name: string; minor: bigint }[]
  shares: { name: string; minor: bigint }[]
}

export interface ImportResult {
  people: string[]
  currency: string
  rows: ImportedRow[]
  /** Things worth telling the person doing the import. */
  warnings: string[]
}

/** Splits one CSV line, honouring quotes and doubled quotes inside them. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += char
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell)
  return cells
}

const FIXED_COLUMNS = 5

function parseAmount(raw: string, currency: string): bigint | null {
  const cleaned = raw.trim().replace(/[\s,]/g, '')
  if (cleaned === '' || cleaned === '-') return 0n
  try {
    return fromMajor(cleaned, currency).minor
  } catch {
    return null
  }
}

export function parseSplitwiseCsv(text: string): ImportResult {
  const warnings: string[] = []
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')

  if (lines.length === 0) throw new Error('That file is empty.')

  const header = splitCsvLine(lines[0]).map((h) => h.trim())
  if (header.length <= FIXED_COLUMNS || header[0].toLowerCase() !== 'date') {
    throw new Error(
      'That does not look like a Splitwise export. Expected a Date, Description, Category, Cost, Currency header followed by a column per person.',
    )
  }

  const people = header.slice(FIXED_COLUMNS).filter((name) => name !== '')
  if (people.length === 0) throw new Error('That export has no people in it.')

  const rows: ImportedRow[] = []
  let currency = 'INR'

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const description = (cells[1] ?? '').trim()
    const date = (cells[0] ?? '').trim()

    /**
     * Every bill is dated. The trailing totals row is not, and Splitwise puts
     * its "Total balance" label in the date column, so requiring a real date
     * drops it without depending on that label staying the same.
     */
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue

    const rowCurrency = (cells[4] ?? '').trim().toUpperCase() || currency
    currency = rowCurrency

    const cost = parseAmount(cells[3] ?? '', rowCurrency)
    if (cost === null) {
      warnings.push(`Skipped "${description}": the cost could not be read.`)
      continue
    }

    const nets = people.map((_, i) =>
      parseAmount(cells[FIXED_COLUMNS + i] ?? '', rowCurrency),
    )
    if (nets.some((n) => n === null)) {
      warnings.push(`Skipped "${description}": one of the amounts could not be read.`)
      continue
    }
    const netValues = nets as bigint[]

    const netSum = netValues.reduce((a, b) => a + b, 0n)
    if (netSum !== 0n) {
      warnings.push(
        `Skipped "${description}": the per person amounts do not cancel out, so it cannot be imported without changing a balance.`,
      )
      continue
    }

    rows.push({
      date,
      description: description || 'Imported expense',
      category: (cells[2] ?? '').trim() || 'General',
      cost: money(cost, rowCurrency),
      nets: netValues,
      ...reconstruct(people, netValues, cost),
    })
  }

  if (rows.length === 0) {
    throw new Error('No expenses could be read from that file.')
  }

  const recovered = rows.filter((r) => !r.splitRecovered).length
  if (recovered > 0) {
    warnings.push(
      `${recovered} ${recovered === 1 ? 'bill was' : 'bills were'} split unevenly. Balances are exact, but who owed what within the bill is a best reconstruction.`,
    )
  }

  return { people, currency, rows, warnings }
}

/**
 * Turn per person balances back into payers and shares.
 *
 * The even split is tried first, since most bills are one: everyone on the
 * bill owes the same, so each person paid their share plus whatever they came
 * out ahead by. If that would make somebody a negative payer the bill was not
 * even, and it falls back to the only thing the file still guarantees, which
 * is that whoever is up paid for whoever is down.
 */
function reconstruct(
  people: string[],
  nets: bigint[],
  cost: bigint,
): Pick<ImportedRow, 'splitRecovered' | 'payers' | 'shares'> {
  const involved = people
    .map((name, i) => ({ name, net: nets[i], i }))
    .filter((p) => p.net !== 0n)

  if (involved.length > 0 && cost > 0n) {
    const each = cost / BigInt(involved.length)
    const remainder = cost - each * BigInt(involved.length)
    const shares = involved.map((p, k) => ({
      name: p.name,
      minor: each + (BigInt(k) < remainder ? 1n : 0n),
    }))
    const payers = involved.map((p, k) => ({
      name: p.name,
      minor: p.net + shares[k].minor,
    }))

    if (payers.every((p) => p.minor >= 0n)) {
      return {
        splitRecovered: true,
        payers: payers.filter((p) => p.minor > 0n),
        shares: shares.filter((s) => s.minor > 0n),
      }
    }
  }

  return {
    splitRecovered: false,
    payers: involved.filter((p) => p.net > 0n).map((p) => ({ name: p.name, minor: p.net })),
    shares: involved
      .filter((p) => p.net < 0n)
      .map((p) => ({ name: p.name, minor: -p.net })),
  }
}
