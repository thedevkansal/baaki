import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  allocate,
  fromMajor,
  money,
  neg,
  splitEqually,
  sum,
  toMajorString,
} from '@/lib/money'

const INR = 'INR'

/** Any amount up to ~10 billion rupees, either sign. */
const anyMinor = fc.bigInt({ min: -1_000_000_000_000n, max: 1_000_000_000_000n })

/** 1-20 weights, at least one of them positive. */
const anyWeights = fc
  .array(fc.bigInt({ min: 0n, max: 10_000n }), { minLength: 1, maxLength: 20 })
  .filter((ws) => ws.some((w) => w > 0n))

const anySeed = fc.integer({ min: -1000, max: 1000 })

describe('allocate', () => {
  it('always sums back to exactly the total', () => {
    fc.assert(
      fc.property(anyMinor, anyWeights, anySeed, (minor, weights, seed) => {
        const total = money(minor, INR)
        const parts = allocate(total, weights, seed)
        expect(sum(parts, INR).minor).toBe(total.minor)
      }),
    )
  })

  it('gives every part the same sign as the total', () => {
    fc.assert(
      fc.property(anyMinor, anyWeights, anySeed, (minor, weights, seed) => {
        const parts = allocate(money(minor, INR), weights, seed)
        for (const p of parts) {
          if (minor >= 0n) expect(p.minor >= 0n).toBe(true)
          else expect(p.minor <= 0n).toBe(true)
        }
      }),
    )
  })

  it('never charges someone with zero weight', () => {
    fc.assert(
      fc.property(anyMinor, anyWeights, anySeed, (minor, weights, seed) => {
        const parts = allocate(money(minor, INR), weights, seed)
        weights.forEach((w, i) => {
          if (w === 0n) expect(parts[i].minor).toBe(0n)
        })
      }),
    )
  })

  it('is symmetric under negation', () => {
    fc.assert(
      fc.property(anyMinor, anyWeights, anySeed, (minor, weights, seed) => {
        const positive = allocate(money(minor, INR), weights, seed)
        const negative = allocate(neg(money(minor, INR)), weights, seed)
        expect(negative.map((p) => p.minor)).toEqual(positive.map((p) => -p.minor))
      }),
    )
  })

  it('keeps every part within one minor unit of its exact share', () => {
    fc.assert(
      fc.property(anyMinor, anyWeights, anySeed, (minor, weights, seed) => {
        const totalWeight = weights.reduce((a, b) => a + b, 0n)
        const magnitude = minor < 0n ? -minor : minor
        const parts = allocate(money(minor, INR), weights, seed)
        parts.forEach((p, i) => {
          const exact = (magnitude * weights[i]) / totalWeight
          const got = p.minor < 0n ? -p.minor : p.minor
          expect(got - exact >= 0n && got - exact <= 1n).toBe(true)
        })
      }),
    )
  })

  it('is deterministic for a given seed', () => {
    fc.assert(
      fc.property(anyMinor, anyWeights, anySeed, (minor, weights, seed) => {
        const a = allocate(money(minor, INR), weights, seed)
        const b = allocate(money(minor, INR), weights, seed)
        expect(a).toEqual(b)
      }),
    )
  })
})

describe('splitEqually', () => {
  it('spreads the remainder so no two people differ by more than one unit', () => {
    fc.assert(
      fc.property(
        anyMinor,
        fc.integer({ min: 1, max: 30 }),
        anySeed,
        (minor, count, seed) => {
          const parts = splitEqually(money(minor, INR), count, seed)
          const values = parts.map((p) => (p.minor < 0n ? -p.minor : p.minor))
          const min = values.reduce((a, b) => (b < a ? b : a))
          const max = values.reduce((a, b) => (b > a ? b : a))
          expect(max - min <= 1n).toBe(true)
        },
      ),
    )
  })

  it('rotates who absorbs the extra unit', () => {
    // 1 rupee across 3 people leaves one extra paisa. Over three consecutive
    // seeds every person should take a turn absorbing it.
    const winners = [0, 1, 2].map((seed) => {
      const parts = splitEqually(fromMajor('1.00', INR), 3, seed)
      return parts.findIndex((p) => p.minor === 34n)
    })
    expect(new Set(winners).size).toBe(3)
  })
})

describe('fromMajor / toMajorString', () => {
  it('round-trips any amount', () => {
    fc.assert(
      fc.property(anyMinor, (minor) => {
        const m = money(minor, INR)
        expect(fromMajor(toMajorString(m), INR).minor).toBe(minor)
      }),
    )
  })
})
