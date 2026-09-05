import { allocate, money, type CurrencyCode, type Money } from '../money'
import type {
  PairwiseDebt,
  ParticipantRef,
  Provenance,
  SimplifyResult,
  Transfer,
} from './types'

/**
 * Collapse a debt graph into the fewest payments that settle it.
 *
 * The greedy max-creditor / max-debtor match is the standard trick and takes
 * at most `participants - 1` transfers. The part that matters for the product
 * is the second return value: every transfer carries the original debts it
 * stands in for, so "why do I owe Rahul?" has an answer on screen instead of
 * being something you have to take on faith.
 */
export function simplify(
  balances: ReadonlyMap<ParticipantRef, Money>,
  pairwise: readonly PairwiseDebt[],
  currency: CurrencyCode,
): SimplifyResult {
  const creditors: { ref: ParticipantRef; minor: bigint }[] = []
  const debtors: { ref: ParticipantRef; minor: bigint }[] = []

  for (const [ref, m] of balances) {
    if (m.minor > 0n) creditors.push({ ref, minor: m.minor })
    else if (m.minor < 0n) debtors.push({ ref, minor: -m.minor })
  }

  // Deterministic order: largest first, ties broken by ref so runs are stable.
  const bySize = (a: { ref: string; minor: bigint }, b: { ref: string; minor: bigint }) =>
    a.minor === b.minor ? a.ref.localeCompare(b.ref) : b.minor > a.minor ? 1 : -1
  creditors.sort(bySize)
  debtors.sort(bySize)

  const transfers: Transfer[] = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]
    const d = debtors[di]
    const amount = c.minor < d.minor ? c.minor : d.minor

    transfers.push({ from: d.ref, to: c.ref, amount: money(amount, currency) })

    c.minor -= amount
    d.minor -= amount
    if (c.minor === 0n) ci += 1
    if (d.minor === 0n) di += 1
  }

  return { transfers, provenance: explain(transfers, pairwise) }
}

/**
 * Attribute each transfer back to the payer's original position.
 *
 * A payer with a single transfer and nothing owed to them is the clean case:
 * the transfer is an exact stand-in for the debts it lists, and the UI can say
 * so plainly. Otherwise the position is split across their transfers in
 * proportion, and `exact` is false so the UI qualifies the wording rather than
 * claiming a precision that is not there.
 */
function explain(
  transfers: readonly Transfer[],
  pairwise: readonly PairwiseDebt[],
): Provenance[] {
  const indicesByPayer = new Map<ParticipantRef, number[]>()
  transfers.forEach((t, i) => {
    const list = indicesByPayer.get(t.from)
    if (list) list.push(i)
    else indicesByPayer.set(t.from, [i])
  })

  const provenance: Provenance[] = transfers.map(() => ({
    replaces: [],
    offsets: [],
    exact: false,
  }))

  for (const [payer, indices] of indicesByPayer) {
    const owes = pairwise.filter((d) => d.from === payer)
    const owed = pairwise.filter((d) => d.to === payer)
    const weights = indices.map((i) => transfers[i].amount.minor)

    const spread = (debts: readonly PairwiseDebt[], into: 'replaces' | 'offsets') => {
      for (const debt of debts) {
        if (indices.length === 1) {
          provenance[indices[0]][into].push(debt)
          continue
        }
        const portions = allocate(debt.amount, weights, 0)
        portions.forEach((portion, k) => {
          if (portion.minor === 0n) return
          provenance[indices[k]][into].push({ ...debt, amount: portion })
        })
      }
    }

    spread(owes, 'replaces')
    spread(owed, 'offsets')

    if (indices.length === 1 && owed.length === 0) {
      provenance[indices[0]].exact = true
    }
  }

  return provenance
}
