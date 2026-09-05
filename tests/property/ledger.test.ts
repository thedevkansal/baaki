import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { netBalances, pairwiseDebts } from '@/lib/ledger/balances'
import { simplify } from '@/lib/ledger/simplify'
import type { ExpenseEntry, ParticipantRef, SettlementEntry } from '@/lib/ledger/types'
import { allocate, money } from '@/lib/money'

const INR = 'INR'

const refs = (count: number): ParticipantRef[] =>
  Array.from({ length: count }, (_, i) => `user:p${i}` as ParticipantRef)

/**
 * A random but always-valid ledger: every expense is built by allocating one
 * total across payer weights and again across share weights, so payers and
 * shares agree by construction and we are testing the ledger rather than the
 * generator.
 */
const anyLedger = fc
  .record({
    people: fc.integer({ min: 2, max: 7 }),
    expenses: fc.array(
      fc.record({
        total: fc.bigInt({ min: 1n, max: 5_000_000n }),
        payerWeights: fc.array(fc.bigInt({ min: 0n, max: 100n }), {
          minLength: 1,
          maxLength: 7,
        }),
        shareWeights: fc.array(fc.bigInt({ min: 0n, max: 100n }), {
          minLength: 1,
          maxLength: 7,
        }),
      }),
      { maxLength: 8 },
    ),
    settlements: fc.array(
      fc.record({
        from: fc.nat(6),
        to: fc.nat(6),
        amount: fc.bigInt({ min: 1n, max: 500_000n }),
        confirmed: fc.boolean(),
      }),
      { maxLength: 4 },
    ),
  })
  .map(({ people, expenses, settlements }) => {
    const participants = refs(people)
    const pad = (ws: bigint[]) => {
      const fitted = Array.from({ length: people }, (_, i) => ws[i] ?? 0n)
      return fitted.some((w) => w > 0n) ? fitted : fitted.map(() => 1n)
    }

    const built: ExpenseEntry[] = expenses.map((e, index) => {
      const total = money(e.total, INR)
      const paid = allocate(total, pad(e.payerWeights), index)
      const owed = allocate(total, pad(e.shareWeights), index)
      return {
        id: `e${index}`,
        payers: participants.map((ref, i) => ({ ref, amount: paid[i] })),
        shares: participants.map((ref, i) => ({ ref, amount: owed[i] })),
      }
    })

    const settled: SettlementEntry[] = settlements
      .filter((s) => s.from % people !== s.to % people)
      .map((s, index) => ({
        id: `s${index}`,
        from: participants[s.from % people],
        to: participants[s.to % people],
        amount: money(s.amount, INR),
        status: s.confirmed ? ('confirmed' as const) : ('proposed' as const),
      }))

    return { participants, expenses: built, settlements: settled }
  })

describe('the ledger conserves money', () => {
  it('nets to zero across the whole group, always', () => {
    fc.assert(
      fc.property(anyLedger, ({ expenses, settlements }) => {
        const net = netBalances(expenses, settlements, INR)
        const total = [...net.values()].reduce((a, m) => a + m.minor, 0n)
        expect(total).toBe(0n)
      }),
    )
  })

  it('agrees with the pairwise graph, person by person', () => {
    fc.assert(
      fc.property(anyLedger, ({ expenses, settlements }) => {
        const net = netBalances(expenses, settlements, INR)
        const edges = pairwiseDebts(expenses, settlements, INR)

        const fromEdges = new Map<ParticipantRef, bigint>()
        for (const e of edges) {
          fromEdges.set(e.from, (fromEdges.get(e.from) ?? 0n) - e.amount.minor)
          fromEdges.set(e.to, (fromEdges.get(e.to) ?? 0n) + e.amount.minor)
        }

        for (const [ref, m] of net) {
          expect(fromEdges.get(ref) ?? 0n).toBe(m.minor)
        }
      }),
    )
  })
})

describe('simplify', () => {
  it('settles everyone to exactly zero', () => {
    fc.assert(
      fc.property(anyLedger, ({ expenses, settlements }) => {
        const net = netBalances(expenses, settlements, INR)
        const { transfers } = simplify(net, pairwiseDebts(expenses, settlements, INR), INR)

        const after = new Map([...net].map(([ref, m]) => [ref, m.minor]))
        for (const t of transfers) {
          after.set(t.from, (after.get(t.from) ?? 0n) + t.amount.minor)
          after.set(t.to, (after.get(t.to) ?? 0n) - t.amount.minor)
        }
        for (const value of after.values()) expect(value).toBe(0n)
      }),
    )
  })

  it('never needs more transfers than participants minus one', () => {
    fc.assert(
      fc.property(anyLedger, ({ expenses, settlements }) => {
        const net = netBalances(expenses, settlements, INR)
        const { transfers } = simplify(net, pairwiseDebts(expenses, settlements, INR), INR)
        const involved = [...net.values()].filter((m) => m.minor !== 0n).length
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, involved - 1))
      }),
    )
  })

  it('only ever moves money from someone who owes to someone who is owed', () => {
    fc.assert(
      fc.property(anyLedger, ({ expenses, settlements }) => {
        const net = netBalances(expenses, settlements, INR)
        const { transfers } = simplify(net, pairwiseDebts(expenses, settlements, INR), INR)
        for (const t of transfers) {
          expect(net.get(t.from)!.minor < 0n).toBe(true)
          expect(net.get(t.to)!.minor > 0n).toBe(true)
          expect(t.amount.minor > 0n).toBe(true)
        }
      }),
    )
  })
})

describe('settlements', () => {
  it('reverting a settlement restores the ledger exactly', () => {
    fc.assert(
      fc.property(anyLedger, ({ participants, expenses, settlements }) => {
        const before = netBalances(expenses, settlements, INR)
        const extra: SettlementEntry = {
          id: 'extra',
          from: participants[0],
          to: participants[1],
          amount: money(123_456n, INR),
          status: 'confirmed',
        }
        const reverted: SettlementEntry = {
          ...extra,
          id: 'extra-reverted',
          from: participants[1],
          to: participants[0],
        }
        const after = netBalances(expenses, [...settlements, extra, reverted], INR)

        for (const [ref, m] of before) expect(after.get(ref)!.minor).toBe(m.minor)
      }),
    )
  })
})
