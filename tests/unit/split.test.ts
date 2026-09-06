import { describe, expect, it } from 'vitest'
import { buildShares, evaluateAmount, type SplitParticipant } from '@/lib/split'
import { fromMajor, sum } from '@/lib/money'

const INR = 'INR'

/** `undefined` means "no value typed", which is every person in an equal split. */
const U = undefined

const people = (values: (string | undefined)[], selected = values.map(() => true)) =>
  values.map(
    (value, i): SplitParticipant => ({ ref: `p${i}`, selected: selected[i], value }),
  )

const minors = (r: { shares: { amount: { minor: bigint } }[] }) =>
  r.shares.map((s) => s.amount.minor)

describe('equal', () => {
  it('splits evenly and gives the odd paisa to someone', () => {
    const r = buildShares(fromMajor('100', INR), 'equal', people([U, U, U]), 0)
    expect(minors(r)).toEqual([3334n, 3333n, 3333n])
    expect(sum(r.shares.map((s) => s.amount), INR).minor).toBe(10000n)
  })

  it('leaves out anyone not in the split', () => {
    const r = buildShares(
      fromMajor('90', INR),
      'equal',
      people([U, U, U], [true, false, true]),
    )
    expect(minors(r)).toEqual([4500n, 0n, 4500n])
  })

  it('refuses to split between nobody', () => {
    const r = buildShares(fromMajor('90', INR), 'equal', people([U, U], [false, false]))
    expect(r.error).toMatch(/at least one person/)
  })
})

describe('shares', () => {
  it('weights a couple as two and a guest as one', () => {
    const r = buildShares(fromMajor('1000', INR), 'shares', people(['2', '1', '1']), 0)
    expect(minors(r)).toEqual([50000n, 25000n, 25000n])
  })

  it('rejects fractional shares', () => {
    expect(buildShares(fromMajor('10', INR), 'shares', people(['1.5', '1'])).error).toMatch(
      /whole numbers/,
    )
  })
})

describe('percent', () => {
  it('accepts percentages that add to a hundred', () => {
    const r = buildShares(
      fromMajor('1000', INR),
      'percent',
      people(['33.33', '33.33', '33.34']),
      0,
    )
    expect(sum(r.shares.map((s) => s.amount), INR).minor).toBe(100000n)
    expect(minors(r)).toEqual([33330n, 33330n, 33340n])
  })

  it('says how far off the percentages are', () => {
    const r = buildShares(fromMajor('1000', INR), 'percent', people(['50', '40']))
    expect(r.error).toMatch(/90\.00%, not 100%/)
  })
})

describe('exact', () => {
  it('uses the amounts as typed', () => {
    const r = buildShares(fromMajor('1000', INR), 'exact', people(['600', '250', '150']))
    expect(minors(r)).toEqual([60000n, 25000n, 15000n])
  })

  it('reports what is still unassigned', () => {
    expect(
      buildShares(fromMajor('1000', INR), 'exact', people(['600', '250'])).error,
    ).toMatch(/150\.00 left to assign/)
  })

  it('reports an overshoot', () => {
    expect(
      buildShares(fromMajor('1000', INR), 'exact', people(['600', '600'])).error,
    ).toMatch(/200\.00 over/)
  })
})

describe('adjustment', () => {
  it('splits the rest evenly after taking the extras off the top', () => {
    // One person had a 200 starter to themselves; the other 700 splits three ways.
    const r = buildShares(
      fromMajor('900', INR),
      'adjustment',
      people(['200', '0', '0']),
      0,
    )
    expect(minors(r)).toEqual([43334n, 23333n, 23333n])
    expect(sum(r.shares.map((s) => s.amount), INR).minor).toBe(90000n)
  })

  it('refuses adjustments larger than the bill', () => {
    expect(
      buildShares(fromMajor('100', INR), 'adjustment', people(['200', '0'])).error,
    ).toMatch(/more than the bill/)
  })

  it('allows a negative adjustment that still leaves everyone above zero', () => {
    // Someone skipped the starters, so they pay 80 less and the rest absorb it.
    const r = buildShares(fromMajor('100', INR), 'adjustment', people(['-80', '0']), 0)
    expect(minors(r)).toEqual([1000n, 9000n])
    expect(sum(r.shares.map((s) => s.amount), INR).minor).toBe(10000n)
  })

  it('refuses to leave someone owing a negative amount', () => {
    expect(
      buildShares(fromMajor('100', INR), 'adjustment', people(['-200', '0'])).error,
    ).toMatch(/negative/)
  })
})

describe('the calculator in the amount field', () => {
  it('adds up a receipt the way people type it', () => {
    expect(evaluateAmount('450+120*2', INR)?.minor).toBe(69000n)
    expect(evaluateAmount('1200/3', INR)?.minor).toBe(40000n)
    expect(evaluateAmount('(200+100)*1.5', INR)?.minor).toBe(45000n)
    expect(evaluateAmount('1,234.50', INR)?.minor).toBe(123450n)
    expect(evaluateAmount('890', INR)?.minor).toBe(89000n)
  })

  it('rounds to the currency, not to two decimals by habit', () => {
    expect(evaluateAmount('1000/3', INR)?.minor).toBe(33333n)
    expect(evaluateAmount('1000/3', 'JPY')?.minor).toBe(333n)
  })

  it('returns nothing rather than guessing', () => {
    for (const bad of ['', 'abc', '5+', '2..5', '(1+2', '1/0', '-50']) {
      expect(evaluateAmount(bad, INR)).toBeNull()
    }
  })

  it('never evaluates anything but arithmetic', () => {
    expect(evaluateAmount('alert(1)', INR)).toBeNull()
    expect(evaluateAmount('process.exit', INR)).toBeNull()
  })
})
