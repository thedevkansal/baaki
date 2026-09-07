import { beforeEach, describe, expect, it } from 'vitest'

/** A minimal localStorage, so the store can be exercised outside a browser. */
class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  clear() {
    this.data.clear()
  }
}

globalThis.localStorage = new MemoryStorage() as unknown as Storage

const {
  addDueOccurrences,
  addExpense,
  addPerson,
  createGroup,
  deleteExpense,
  getState,
  proposeSettlement,
  resetEverything,
  seedSampleGroup,
  setSettlementStatus,
  updateExpense,
} = await import('@/lib/store/store')

const { netBalances } = await import('@/lib/ledger/balances')
const { refOf } = await import('@/lib/store/use-store')
const { buildShares } = await import('@/lib/split')
const { fromMajor, money } = await import('@/lib/money')

const INR = 'INR'

/** Balances, computed the way the app computes them. */
function balancesFor(groupId: string) {
  const state = getState()
  const currency = state.groups.find((g) => g.id === groupId)!.currency
  return netBalances(
    state.expenses
      .filter((e) => e.groupId === groupId)
      .map((e) => ({
        id: e.id,
        payers: e.payers.map((p) => ({
          ref: refOf(p.personId),
          amount: money(BigInt(p.minor), currency),
        })),
        shares: e.shares.map((s) => ({
          ref: refOf(s.personId),
          amount: money(BigInt(s.minor), currency),
        })),
      })),
    state.settlements
      .filter((s) => s.groupId === groupId)
      .map((s) => ({
        id: s.id,
        from: refOf(s.fromId),
        to: refOf(s.toId),
        amount: money(BigInt(s.minor), currency),
        status: s.status,
      })),
    currency,
  )
}

const netOf = (groupId: string, personId: string) =>
  balancesFor(groupId).get(refOf(personId))?.minor ?? 0n

function sumsToZero(groupId: string) {
  return [...balancesFor(groupId).values()].reduce((a, m) => a + m.minor, 0n)
}

/** Split a total equally and hand it to the store the way the sheet does. */
function equalBill(
  groupId: string,
  description: string,
  payerId: string,
  total: string,
  among: string[],
  seed = 0,
) {
  const split = buildShares(
    fromMajor(total, INR),
    'equal',
    among.map((ref) => ({ ref, selected: true })),
    seed,
  )
  return addExpense({
    groupId,
    description,
    category: 'General',
    occurredOn: '2026-09-01',
    splitMode: 'equal',
    payers: [{ personId: payerId, minor: fromMajor(total, INR).minor }],
    shares: split.shares.map((s) => ({ personId: s.ref, minor: s.amount.minor })),
  })
}

beforeEach(() => {
  resetEverything()
})

describe('a group from scratch', () => {
  it('walks the whole journey and stays balanced at every step', () => {
    const me = getState().meId
    const priya = addPerson('Priya').id
    const rahul = addPerson('Rahul').id
    const group = createGroup('Goa trip', INR, [me, priya, rahul])

    // Priya pays for the house.
    equalBill(group.id, 'Beach house', priya, '9000', [me, priya, rahul])
    expect(netOf(group.id, me)).toBe(-300000n)
    expect(netOf(group.id, priya)).toBe(600000n)
    expect(sumsToZero(group.id)).toBe(0n)

    // You pay for dinner.
    equalBill(group.id, 'Dinner', me, '1500', [me, priya, rahul], 1)
    expect(netOf(group.id, me)).toBe(-200000n)
    expect(sumsToZero(group.id)).toBe(0n)

    // You settle with Priya, which does nothing until she confirms.
    const settlement = proposeSettlement({
      groupId: group.id,
      fromId: me,
      toId: priya,
      minor: 200000n,
      method: 'upi',
    })
    expect(netOf(group.id, me)).toBe(-200000n)

    setSettlementStatus(settlement.id, 'confirmed')
    expect(netOf(group.id, me)).toBe(0n)
    expect(sumsToZero(group.id)).toBe(0n)
  })

  it('leaves the ledger balanced after an edit', () => {
    const me = getState().meId
    const priya = addPerson('Priya').id
    const group = createGroup('Flat', INR, [me, priya])
    const bill = equalBill(group.id, 'Wifi', me, '1000', [me, priya])

    expect(netOf(group.id, me)).toBe(50000n)

    const split = buildShares(
      fromMajor('1600', INR),
      'equal',
      [me, priya].map((ref) => ({ ref, selected: true })),
    )
    updateExpense(bill.id, {
      groupId: group.id,
      description: 'Wifi',
      category: 'Utilities',
      occurredOn: '2026-09-01',
      splitMode: 'equal',
      payers: [{ personId: me, minor: fromMajor('1600', INR).minor }],
      shares: split.shares.map((s) => ({ personId: s.ref, minor: s.amount.minor })),
    })

    expect(getState().expenses).toHaveLength(1)
    expect(netOf(group.id, me)).toBe(80000n)
    expect(sumsToZero(group.id)).toBe(0n)
  })

  it('returns to zero when the only bill is deleted', () => {
    const me = getState().meId
    const priya = addPerson('Priya').id
    const group = createGroup('Flat', INR, [me, priya])
    const bill = equalBill(group.id, 'Wifi', me, '1000', [me, priya])

    deleteExpense(bill.id)
    expect(netOf(group.id, me)).toBe(0n)
    expect(sumsToZero(group.id)).toBe(0n)
  })

  it('keeps a disputed payment out of the balances', () => {
    const me = getState().meId
    const priya = addPerson('Priya').id
    const group = createGroup('Flat', INR, [me, priya])
    equalBill(group.id, 'Wifi', priya, '1000', [me, priya])

    const settlement = proposeSettlement({
      groupId: group.id,
      fromId: me,
      toId: priya,
      minor: 50000n,
      method: 'cash',
    })
    setSettlementStatus(settlement.id, 'disputed')
    expect(netOf(group.id, me)).toBe(-50000n)
  })
})

describe('repeats', () => {
  it('copies a bill onto each due date without touching the balance rule', () => {
    const me = getState().meId
    const priya = addPerson('Priya').id
    const group = createGroup('Flat', INR, [me, priya])

    const split = buildShares(fromMajor('5000', INR), 'equal', [
      { ref: me, selected: true },
      { ref: priya, selected: true },
    ])
    const rent = addExpense({
      groupId: group.id,
      description: 'Rent',
      category: 'Rent',
      occurredOn: '2026-06-01',
      splitMode: 'equal',
      payers: [{ personId: me, minor: fromMajor('5000', INR).minor }],
      shares: split.shares.map((s) => ({ personId: s.ref, minor: s.amount.minor })),
      repeat: 'monthly',
    })

    const added = addDueOccurrences(rent.id, ['2026-07-01', '2026-08-01'])
    expect(added).toBe(2)
    expect(getState().expenses).toHaveLength(3)

    // Three months of rent, half of each owed to you.
    expect(netOf(group.id, me)).toBe(750000n)
    expect(sumsToZero(group.id)).toBe(0n)

    // Copies point back at the original and do not repeat themselves.
    const copies = getState().expenses.filter((e) => e.repeatOf === rent.id)
    expect(copies).toHaveLength(2)
    expect(copies.every((c) => c.repeat === undefined)).toBe(true)
  })

  it('does nothing for a series that no longer exists', () => {
    expect(addDueOccurrences('gone', ['2026-07-01'])).toBe(0)
  })
})

describe('the sample trip', () => {
  it('is a balanced ledger, not a picture of one', () => {
    const group = seedSampleGroup()
    expect(sumsToZero(group.id)).toBe(0n)
    expect(getState().expenses.filter((e) => e.groupId === group.id)).toHaveLength(5)
    // Somebody has to be owed something, or there is nothing to demonstrate.
    expect([...balancesFor(group.id).values()].some((m) => m.minor !== 0n)).toBe(true)
  })
})

describe('persistence', () => {
  it('writes through to storage so a reload keeps the group', () => {
    const me = getState().meId
    const group = createGroup('Flat', INR, [me])
    const raw = localStorage.getItem('baaki-state-v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.groups.map((g: { id: string }) => g.id)).toContain(group.id)
  })
})
