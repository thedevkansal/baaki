import { describe, expect, it } from 'vitest'
import { parseSplitwiseCsv, splitCsvLine } from '@/lib/import-splitwise'

/** A file shaped the way Splitwise exports one: a group per file. */
const EXPORT = [
  'Date,Description,Category,Cost,Currency,Alice,Bob,Carol',
  '2026-08-01,Beach house,Accommodation,12000.00,INR,8000.00,-4000.00,-4000.00',
  '2026-08-02,Dinner,Food,900.00,INR,-300.00,600.00,-300.00',
  '2026-08-03,Cab,Transportation,600.00,INR,-200.00,-200.00,400.00',
  'Total balance,,,0.00,INR,7500.00,-3600.00,-3900.00',
].join('\n')

describe('splitting a line', () => {
  it('handles quotes, commas and doubled quotes', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
    expect(splitCsvLine('"a,b",c')).toEqual(['a,b', 'c'])
    expect(splitCsvLine('"say ""hi""",c')).toEqual(['say "hi"', 'c'])
    expect(splitCsvLine('a,,c')).toEqual(['a', '', 'c'])
  })
})

describe('reading an export', () => {
  it('finds the people and the bills', () => {
    const result = parseSplitwiseCsv(EXPORT)
    expect(result.people).toEqual(['Alice', 'Bob', 'Carol'])
    expect(result.currency).toBe('INR')
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].description).toBe('Beach house')
    expect(result.rows[0].category).toBe('Accommodation')
    expect(result.rows[0].cost.minor).toBe(1200000n)
  })

  it('leaves out the total balance row', () => {
    const result = parseSplitwiseCsv(EXPORT)
    expect(result.rows.some((r) => /total/i.test(r.description))).toBe(false)
  })

  it('reproduces every balance exactly', () => {
    const result = parseSplitwiseCsv(EXPORT)
    const net = new Map<string, bigint>()
    for (const row of result.rows) {
      for (const p of row.payers) net.set(p.name, (net.get(p.name) ?? 0n) + p.minor)
      for (const s of row.shares) net.set(s.name, (net.get(s.name) ?? 0n) - s.minor)
    }
    // The totals Splitwise itself printed on the last row.
    expect(net.get('Alice')).toBe(750000n)
    expect(net.get('Bob')).toBe(-360000n)
    expect(net.get('Carol')).toBe(-390000n)
    expect([...net.values()].reduce((a, b) => a + b, 0n)).toBe(0n)
  })

  it('conserves money on every reconstructed bill', () => {
    const result = parseSplitwiseCsv(EXPORT)
    for (const row of result.rows) {
      const paid = row.payers.reduce((a, p) => a + p.minor, 0n)
      const owed = row.shares.reduce((a, s) => a + s.minor, 0n)
      expect(paid).toBe(owed)
    }
  })

  it('recovers an even split as an even split', () => {
    const result = parseSplitwiseCsv(EXPORT)
    const house = result.rows[0]
    expect(house.splitRecovered).toBe(true)
    expect(house.shares).toEqual([
      { name: 'Alice', minor: 400000n },
      { name: 'Bob', minor: 400000n },
      { name: 'Carol', minor: 400000n },
    ])
    expect(house.payers).toEqual([{ name: 'Alice', minor: 1200000n }])
  })

  it('says so when the split cannot be recovered', () => {
    // Bob paid 1000 of a 1000 bill that only Alice consumed, so no even split
    // over the two of them can produce these balances.
    const uneven = [
      'Date,Description,Category,Cost,Currency,Alice,Bob',
      '2026-08-01,Alice only,General,1000.00,INR,-1000.00,1000.00',
    ].join('\n')
    const result = parseSplitwiseCsv(uneven)
    const row = result.rows[0]
    expect(row.splitRecovered).toBe(false)
    expect(row.payers).toEqual([{ name: 'Bob', minor: 100000n }])
    expect(row.shares).toEqual([{ name: 'Alice', minor: 100000n }])
    expect(result.warnings.join(' ')).toMatch(/best reconstruction/)
  })

  it('skips a row whose amounts do not cancel out', () => {
    const broken = [
      'Date,Description,Category,Cost,Currency,Alice,Bob',
      '2026-08-01,Good,General,100.00,INR,50.00,-50.00',
      '2026-08-02,Bad,General,100.00,INR,50.00,-40.00',
    ].join('\n')
    const result = parseSplitwiseCsv(broken)
    expect(result.rows).toHaveLength(1)
    expect(result.warnings.join(' ')).toMatch(/do not cancel out/)
  })

  it('survives descriptions with commas and quotes', () => {
    const quoted = [
      'Date,Description,Category,Cost,Currency,Alice,Bob',
      '2026-08-01,"Dinner, drinks and a ""big"" tip",Food,100.00,INR,50.00,-50.00',
    ].join('\n')
    expect(parseSplitwiseCsv(quoted).rows[0].description).toBe(
      'Dinner, drinks and a "big" tip',
    )
  })

  it('copes with a byte order mark and CRLF endings', () => {
    const withBom = '﻿' + EXPORT.split('\n').join('\r\n')
    expect(parseSplitwiseCsv(withBom).rows).toHaveLength(3)
  })

  it('carries the currency from the file', () => {
    const usd = [
      'Date,Description,Category,Cost,Currency,Alice,Bob',
      '2026-08-01,Dinner,Food,100.00,USD,50.00,-50.00',
    ].join('\n')
    const result = parseSplitwiseCsv(usd)
    expect(result.currency).toBe('USD')
    expect(result.rows[0].cost.currency).toBe('USD')
  })

  it('refuses a file that is not an export', () => {
    expect(() => parseSplitwiseCsv('')).toThrow(/empty/)
    expect(() => parseSplitwiseCsv('hello,world')).toThrow(/does not look like/)
    expect(() => parseSplitwiseCsv('Date,Description,Category,Cost,Currency')).toThrow(
      /does not look like/,
    )
  })

  it('refuses a file with a header but no readable bills', () => {
    expect(() =>
      parseSplitwiseCsv('Date,Description,Category,Cost,Currency,Alice,Bob\nTotal balance,,,0.00,INR,0.00,0.00'),
    ).toThrow(/No expenses/)
  })
})
