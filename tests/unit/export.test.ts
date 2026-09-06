import { describe, expect, it } from 'vitest'
import { buildGroupCsv, csvFilename, describeExport, toCsvRow } from '@/lib/export'
import type { Expense, Person, Settlement } from '@/lib/store/types'

const members: Person[] = [
  { id: 'p1', name: 'You' },
  { id: 'p2', name: 'Priya' },
]

const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone'

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  groupId: 'g1',
  description: 'Beach house',
  category: 'Stay',
  occurredOn: '2026-09-04',
  splitMode: 'equal',
  payers: [{ personId: 'p2', minor: '124000' }],
  shares: [
    { personId: 'p1', minor: '62000' },
    { personId: 'p2', minor: '62000' },
  ],
  createdAt: '2026-09-04T10:00:00.000Z',
  ...over,
})

const base = {
  groupName: 'Goa trip',
  currency: 'INR',
  members,
  nameOf,
  settlements: [] as Settlement[],
}

describe('csv escaping', () => {
  it('quotes only what has to be quoted', () => {
    expect(toCsvRow(['plain', 'two words'])).toBe('plain,two words')
    expect(toCsvRow(['a,b'])).toBe('"a,b"')
    expect(toCsvRow(['say "hi"'])).toBe('"say ""hi"""')
    expect(toCsvRow(['line\nbreak'])).toBe('"line\nbreak"')
  })

  it('survives a description that would otherwise break the file', () => {
    const csv = buildGroupCsv({
      ...base,
      expenses: [expense({ description: 'Dinner, drinks and a "big" tip' })],
    })
    expect(csv).toContain('"Dinner, drinks and a ""big"" tip"')
    // Two lines: the header and the one bill.
    expect(csv.split('\r\n')).toHaveLength(2)
  })
})

describe('the sheet itself', () => {
  it('gives every person their own column', () => {
    const csv = buildGroupCsv({ ...base, expenses: [expense()] })
    const [header, row] = csv.split('\r\n')
    expect(header.split(',').slice(-2)).toEqual(['You', 'Priya'])
    expect(row.split(',').slice(-2)).toEqual(['620.00', '620.00'])
  })

  it('writes amounts a spreadsheet reads as numbers', () => {
    const csv = buildGroupCsv({ ...base, expenses: [expense()] })
    // No symbol, no lakh grouping, no quotes.
    expect(csv).toContain('1240.00')
    expect(csv).not.toContain('₹')
    expect(csv).not.toContain('1,240')
  })

  it('records who paid, including when several people did', () => {
    const csv = buildGroupCsv({
      ...base,
      expenses: [
        expense({
          payers: [
            { personId: 'p1', minor: '80000' },
            { personId: 'p2', minor: '44000' },
          ],
        }),
      ],
    })
    // Semicolon separated on purpose: a comma here would force the field to
    // be quoted, which is noise in every spreadsheet that opens it.
    expect(csv).toContain('You 800.00; Priya 440.00')
    expect(csv).not.toContain('"You 800.00')
  })

  it('keeps what was actually spent on a foreign bill', () => {
    const csv = buildGroupCsv({
      ...base,
      expenses: [
        expense({
          original: { currency: 'USD', minor: '10000', rateToGroupCurrency: '88' },
        }),
      ],
    })
    const row = csv.split('\r\n')[1].split(',')
    expect(row[6]).toBe('USD')
    expect(row[7]).toBe('100.00')
    expect(row[8]).toBe('88')
  })

  it('puts bills in date order regardless of entry order', () => {
    const csv = buildGroupCsv({
      ...base,
      expenses: [
        expense({ id: 'b', description: 'Later', occurredOn: '2026-09-09' }),
        expense({ id: 'a', description: 'Earlier', occurredOn: '2026-09-01' }),
      ],
    })
    const lines = csv.split('\r\n')
    expect(lines[1]).toContain('Earlier')
    expect(lines[2]).toContain('Later')
  })

  it('includes confirmed settlements and leaves the rest out', () => {
    const settlement = (over: Partial<Settlement>): Settlement => ({
      id: 's1',
      groupId: 'g1',
      fromId: 'p1',
      toId: 'p2',
      minor: '62000',
      method: 'upi',
      status: 'confirmed',
      createdAt: '2026-09-06T10:00:00.000Z',
      ...over,
    })

    const csv = buildGroupCsv({
      ...base,
      expenses: [expense()],
      settlements: [
        settlement({}),
        settlement({ id: 's2', status: 'proposed' }),
        settlement({ id: 's3', status: 'disputed' }),
      ],
    })
    expect(csv).toContain('Settlement: You paid Priya')
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})

describe('naming the file', () => {
  it('slugs the group and stamps the day', () => {
    expect(csvFilename('Goa trip', new Date('2026-09-07T00:00:00Z'))).toBe(
      'baaki-goa-trip-2026-09-07.csv',
    )
    expect(csvFilename('Flat 402 !!', new Date('2026-01-02T00:00:00Z'))).toBe(
      'baaki-flat-402-2026-01-02.csv',
    )
    expect(csvFilename('!!!', new Date('2026-01-02T00:00:00Z'))).toBe(
      'baaki-group-2026-01-02.csv',
    )
  })
})

describe('describing the export', () => {
  it('counts in plain words', () => {
    expect(describeExport(1, 0)).toBe('1 bill')
    expect(describeExport(7, 0)).toBe('7 bills')
    expect(describeExport(7, 1)).toBe('7 bills and 1 settlement')
    expect(describeExport(2, 3)).toBe('2 bills and 3 settlements')
  })
})
