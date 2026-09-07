import type { SplitMode } from '../split'
import type { Repeat } from '../recurring'

/**
 * Everything is stored with amounts as decimal strings of minor units, because
 * JSON has no bigint. They become `Money` the moment they are read and never
 * travel as numbers.
 */

export interface Person {
  id: string
  name: string
  /** UPI ID, so settling can prefill. Optional - ghosts often have none. */
  vpa?: string
}

export interface Group {
  id: string
  name: string
  /** Every balance in this group is carried in this currency. */
  currency: string
  memberIds: string[]
  createdAt: string
  simplify: boolean
  /**
   * Set once the group has been pushed to the server and join links exist.
   * Absent means the group lives only on this device, which is the default and
   * needs no account to work.
   */
  shared?: {
    /** When this device last pulled the server copy. */
    lastPulledAt?: string
  }
}

export interface Allocation {
  personId: string
  /** Minor units, in the group's currency. */
  minor: string
}

export interface Expense {
  id: string
  groupId: string
  description: string
  category: string
  occurredOn: string
  splitMode: SplitMode
  payers: Allocation[]
  shares: Allocation[]
  /**
   * What was typed into the split fields, keyed by person: percentages,
   * shares, exact amounts. Kept so reopening a bill shows the split the way it
   * was entered rather than reverse engineering it from the amounts.
   */
  splitValues?: Record<string, string>
  /** Set on the first bill of a series. Later ones point back at it instead. */
  repeat?: Repeat
  /** The id of the bill this one repeats. */
  repeatOf?: string
  /**
   * What was actually spent, before conversion. Kept alongside the converted
   * amounts so an old expense still shows the number that was on the bill.
   */
  original?: {
    currency: string
    minor: string
    rateToGroupCurrency: string
  }
  createdAt: string
}

export interface Settlement {
  id: string
  groupId: string
  fromId: string
  toId: string
  minor: string
  method: 'upi' | 'cash' | 'bank' | 'other'
  /** Balances move on `confirmed` only. Nobody's word alone moves money. */
  status: 'proposed' | 'confirmed' | 'disputed'
  createdAt: string
}

export interface AppState {
  version: 1
  /** Which person is holding the phone. */
  meId: string
  people: Person[]
  groups: Group[]
  expenses: Expense[]
  settlements: Settlement[]
}

export const CATEGORIES = [
  'General',
  'Food',
  'Stay',
  'Travel',
  'Groceries',
  'Rent',
  'Utilities',
  'Entertainment',
  'Shopping',
  'Health',
] as const
