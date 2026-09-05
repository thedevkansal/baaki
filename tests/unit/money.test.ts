import { describe, expect, it } from 'vitest'
import {
  add,
  allocate,
  compare,
  fromMajor,
  money,
  splitEqually,
  sub,
  sum,
  toMajorString,
} from '@/lib/money'

const INR = 'INR'

const minorOf = (parts: { minor: bigint }[]) => parts.map((p) => p.minor)

describe('parsing', () => {
  it('reads rupees and paise exactly', () => {
    expect(fromMajor('1234.50', INR).minor).toBe(123450n)
    expect(fromMajor('1,234.50', INR).minor).toBe(123450n)
    expect(fromMajor('-12.3', INR).minor).toBe(-1230n)
    expect(fromMajor('40', INR).minor).toBe(4000n)
    expect(fromMajor('.5', INR).minor).toBe(50n)
  })

  it('respects currencies with other minor-unit exponents', () => {
    expect(fromMajor('1200', 'JPY').minor).toBe(1200n)
    expect(toMajorString(money(1200n, 'JPY'))).toBe('1200')
    expect(fromMajor('1.234', 'KWD').minor).toBe(1234n)
  })

  it('rejects amounts with too much precision for the currency', () => {
    expect(() => fromMajor('1.234', INR)).toThrow(/decimal place/)
    expect(() => fromMajor('12.5', 'JPY')).toThrow(/decimal place/)
  })

  it('rejects things that are not amounts', () => {
    expect(() => fromMajor('abc', INR)).toThrow(/cannot parse/)
    expect(() => fromMajor('', INR)).toThrow(/cannot parse/)
  })

  it('formats without losing the leading zero', () => {
    expect(toMajorString(money(5n, INR))).toBe('0.05')
    expect(toMajorString(money(-5n, INR))).toBe('-0.05')
    expect(toMajorString(money(0n, INR))).toBe('0.00')
  })
})

describe('arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(add(fromMajor('0.1', INR), fromMajor('0.2', INR)).minor).toBe(30n)
    expect(sub(fromMajor('1', INR), fromMajor('0.99', INR)).minor).toBe(1n)
    expect(sum([fromMajor('10', INR), fromMajor('20.55', INR)], INR).minor).toBe(3055n)
  })

  it('refuses to mix currencies', () => {
    expect(() => add(money(1n, INR), money(1n, 'USD'))).toThrow(/currency mismatch/)
    expect(() => compare(money(1n, INR), money(1n, 'USD'))).toThrow(/currency mismatch/)
  })
})

describe('golden splits', () => {
  it('splits 100 rupees three ways', () => {
    const parts = splitEqually(fromMajor('100', INR), 3, 0)
    expect(minorOf(parts)).toEqual([3334n, 3333n, 3333n])
    expect(sum(parts, INR).minor).toBe(10000n)
  })

  it('splits a single paisa seven ways', () => {
    const parts = splitEqually(fromMajor('0.01', INR), 7, 0)
    expect(minorOf(parts)).toEqual([1n, 0n, 0n, 0n, 0n, 0n, 0n])
    expect(sum(parts, INR).minor).toBe(1n)
  })

  it('rotates the odd paisa on the next expense', () => {
    expect(minorOf(splitEqually(fromMajor('0.01', INR), 7, 1))).toEqual([
      0n,
      1n,
      0n,
      0n,
      0n,
      0n,
      0n,
    ])
    expect(minorOf(splitEqually(fromMajor('0.01', INR), 7, 2))).toEqual([
      0n,
      0n,
      1n,
      0n,
      0n,
      0n,
      0n,
    ])
  })

  it('splits 1000 rupees across twelve people by weight', () => {
    // One couple counts double, ten people count once: fourteen shares total.
    const weights = [2n, 2n, ...Array.from({ length: 10 }, () => 1n)]
    const parts = allocate(fromMajor('1000', INR), weights, 0)
    expect(sum(parts, INR).minor).toBe(100000n)
    expect(parts[0].minor).toBe(14285n)
    expect(parts[2].minor).toBe(7143n)
  })

  it('leaves a zero-weight participant owing nothing', () => {
    const parts = allocate(fromMajor('99.99', INR), [1n, 0n, 1n], 0)
    expect(parts[1].minor).toBe(0n)
    expect(sum(parts, INR).minor).toBe(9999n)
  })
})
