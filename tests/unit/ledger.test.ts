import { describe, expect, it } from 'vitest'
import { netBalances, pairwiseDebts, totalOutstanding } from '@/lib/ledger/balances'
import { simplify } from '@/lib/ledger/simplify'
import type { ExpenseEntry, ParticipantRef, SettlementEntry } from '@/lib/ledger/types'
import { fromMajor, splitEqually } from '@/lib/money'

const INR = 'INR'

const A = 'user:aditya' as ParticipantRef
const P = 'user:priya' as ParticipantRef
const M = 'user:aman' as ParticipantRef
const R = 'user:rahul' as ParticipantRef
const EVERYONE = [A, P, M, R]

function equalSplit(
  id: string,
  description: string,
  payer: ParticipantRef,
  total: string,
  among: ParticipantRef[],
  seed = 0,
): ExpenseEntry {
  const shares = splitEqually(fromMajor(total, INR), among.length, seed)
  return {
    id,
    description,
    payers: [{ ref: payer, amount: fromMajor(total, INR) }],
    shares: among.map((ref, i) => ({ ref, amount: shares[i] })),
  }
}

/** Priya covers the hotel, Aman covers dinner, everyone splits both. */
const GOA: ExpenseEntry[] = [
  equalSplit('e1', 'Goa hotel', P, '840', EVERYONE),
  equalSplit('e2', 'Dinner', M, '520', EVERYONE),
]

describe('net balances', () => {
  it('adds up to zero across the group', () => {
    const net = netBalances(GOA, [], INR)
    const total = [...net.values()].reduce((a, m) => a + m.minor, 0n)
    expect(total).toBe(0n)
  })

  it('credits what you paid and debits what you consumed', () => {
    const net = netBalances(GOA, [], INR)
    expect(net.get(P)!.minor).toBe(50000n) // paid 840, consumed 340
    expect(net.get(M)!.minor).toBe(18000n) // paid 520, consumed 340
    expect(net.get(A)!.minor).toBe(-34000n)
    expect(net.get(R)!.minor).toBe(-34000n)
    expect(totalOutstanding(net, INR).minor).toBe(68000n)
  })

  it('rejects an expense where payers and shares disagree', () => {
    const broken: ExpenseEntry = {
      id: 'bad',
      payers: [{ ref: A, amount: fromMajor('100', INR) }],
      shares: [{ ref: P, amount: fromMajor('99', INR) }],
    }
    expect(() => netBalances([broken], [], INR)).toThrow(/payers total/)
  })

  it('ignores settlements nobody has confirmed', () => {
    const proposed: SettlementEntry = {
      id: 's1',
      from: A,
      to: P,
      amount: fromMajor('340', INR),
      status: 'proposed',
    }
    expect(netBalances(GOA, [proposed], INR).get(A)!.minor).toBe(-34000n)

    const confirmed: SettlementEntry = { ...proposed, status: 'confirmed' }
    expect(netBalances(GOA, [confirmed], INR).get(A)!.minor).toBe(0n)
  })
})

describe('pairwise debts', () => {
  it('records who actually owes whom', () => {
    const debts = pairwiseDebts(GOA, [], INR)
    const find = (from: ParticipantRef, to: ParticipantRef) =>
      debts.find((d) => d.from === from && d.to === to)?.amount.minor

    expect(find(A, P)).toBe(21000n)
    expect(find(A, M)).toBe(13000n)
    expect(find(R, P)).toBe(21000n)
    expect(find(R, M)).toBe(13000n)
    // Aman owes Priya 210 for the hotel, Priya owes Aman 130 for dinner.
    // Only the net edge survives: Aman owes Priya 80.
    expect(find(M, P)).toBe(8000n)
    expect(find(P, M)).toBeUndefined()
  })

  it('matches shares off against payers exactly when several people paid', () => {
    const shares = splitEqually(fromMajor('300', INR), 3, 0)
    const expense: ExpenseEntry = {
      id: 'e3',
      description: 'Cab',
      payers: [
        { ref: P, amount: fromMajor('200', INR) },
        { ref: M, amount: fromMajor('100', INR) },
      ],
      shares: [A, P, M].map((ref, i) => ({ ref, amount: shares[i] })),
    }
    const debts = pairwiseDebts([expense], [], INR)
    const find = (from: ParticipantRef, to: ParticipantRef) =>
      debts.find((d) => d.from === from && d.to === to)?.amount.minor

    // Priya put down 200 and only consumed 100, so she covers Aditya's whole
    // share on her own. Aman paid exactly what he ate and is square with
    // everyone, so he gets no edge at all.
    expect(find(A, P)).toBe(10000n)
    expect(find(A, M)).toBeUndefined()
    expect(debts).toHaveLength(1)

    // Which is still the right answer: it reproduces the net positions exactly.
    const net = netBalances([expense], [], INR)
    expect(net.get(A)!.minor).toBe(-10000n)
    expect(net.get(P)!.minor).toBe(10000n)
    expect(net.get(M)!.minor).toBe(0n)
  })
})

describe('simplify', () => {
  const net = netBalances(GOA, [], INR)
  const pairwise = pairwiseDebts(GOA, [], INR)
  const { transfers, provenance } = simplify(net, pairwise, INR)

  it('needs no more transfers than participants minus one', () => {
    expect(transfers.length).toBeLessThanOrEqual(net.size - 1)
  })

  it('leaves everybody settled', () => {
    const after = new Map([...net].map(([ref, m]) => [ref, m.minor]))
    for (const t of transfers) {
      after.set(t.from, after.get(t.from)! + t.amount.minor)
      after.set(t.to, after.get(t.to)! - t.amount.minor)
    }
    for (const value of after.values()) expect(value).toBe(0n)
  })

  it('explains what a simplified debt stands in for', () => {
    const index = transfers.findIndex((t) => t.from === A)
    expect(transfers[index].amount.minor).toBe(34000n)

    const why = provenance[index]
    expect(why.exact).toBe(true)
    expect(why.offsets).toHaveLength(0)
    expect(why.replaces.map((d) => [d.to, d.amount.minor]).sort()).toEqual([
      [M, 13000n],
      [P, 21000n],
    ])
    // The explanation accounts for the whole transfer, to the paisa.
    expect(why.replaces.reduce((a, d) => a + d.amount.minor, 0n)).toBe(34000n)
  })

  it('flags an explanation as inexact when debts were netted off on the way', () => {
    // Aditya owes Priya 500 but Rahul owes Aditya 200, so Aditya's single
    // transfer of 300 is not a clean stand-in for anything.
    const entries: ExpenseEntry[] = [
      {
        id: 'x1',
        payers: [{ ref: P, amount: fromMajor('500', INR) }],
        shares: [{ ref: A, amount: fromMajor('500', INR) }],
      },
      {
        id: 'x2',
        payers: [{ ref: A, amount: fromMajor('200', INR) }],
        shares: [{ ref: R, amount: fromMajor('200', INR) }],
      },
    ]
    const balances = netBalances(entries, [], INR)
    const result = simplify(balances, pairwiseDebts(entries, [], INR), INR)
    const i = result.transfers.findIndex((t) => t.from === A)

    expect(result.transfers[i].amount.minor).toBe(30000n)
    expect(result.provenance[i].exact).toBe(false)
    expect(result.provenance[i].offsets.map((d) => d.from)).toEqual([R])
  })
})
