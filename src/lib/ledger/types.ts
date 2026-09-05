import type { Money } from '../money'

/**
 * A participant is either an account holder or a ghost - someone added to a
 * group by name alone, with no email or phone. Both flow through identical
 * code paths, which is why this is one tagged string rather than two types.
 */
export type ParticipantRef = `user:${string}` | `ghost:${string}`

export interface Allocation {
  ref: ParticipantRef
  amount: Money
}

/**
 * One expense, already split.
 *
 * `payers` is who actually put money down - more than one person can, which
 * Splitwise's free tier will not let you record at all. `shares` is who
 * consumed it. The two must sum to the same amount; `assertBalanced` checks.
 */
export interface ExpenseEntry {
  id: string
  description?: string
  payers: Allocation[]
  shares: Allocation[]
}

export interface SettlementEntry {
  id: string
  from: ParticipantRef
  to: ParticipantRef
  amount: Money
  /**
   * Only `confirmed` settlements move balances. A `proposed` one is somebody
   * saying they paid; the other person has not agreed yet.
   */
  status: 'proposed' | 'confirmed' | 'disputed'
}

export interface Transfer {
  from: ParticipantRef
  to: ParticipantRef
  amount: Money
}

export type PairwiseDebt = Transfer

/**
 * Why a simplified transfer exists.
 *
 * `replaces` are debts the payer genuinely owed. `offsets` are debts owed *to*
 * the payer that were netted off on the way. `exact` is true only when this
 * transfer is a clean stand-in for the whole position - one transfer, nothing
 * netted - which is when the UI can say "this replaces X and Y" without
 * qualification.
 */
export interface Provenance {
  replaces: PairwiseDebt[]
  offsets: PairwiseDebt[]
  exact: boolean
}

export interface SimplifyResult {
  transfers: Transfer[]
  provenance: Provenance[]
}
