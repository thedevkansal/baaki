import type { AppState, Expense, Group, Person, Settlement } from '../store/types'

/**
 * What one group looks like on the wire.
 *
 * Deliberately the same shapes the local store already holds, minus the rest of
 * the device's state. Amounts stay decimal strings of minor units the whole way
 * across, because JSON has no bigint and a number would be a lie.
 */
export interface GroupPayload {
  group: Group
  people: Person[]
  expenses: Expense[]
  settlements: Settlement[]
}

/** The slice of a device's state that belongs to one group. */
export function payloadFor(state: AppState, groupId: string): GroupPayload | null {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return null

  const memberIds = new Set(group.memberIds)
  return {
    group,
    people: state.people.filter((p) => memberIds.has(p.id)),
    expenses: state.expenses.filter((e) => e.groupId === groupId),
    settlements: state.settlements.filter((s) => s.groupId === groupId),
  }
}

/** One person's join link, handed out after a group is shared. */
export interface JoinLink {
  /** The person's local id, so the sharing device can label the link. */
  personId: string
  name: string
  /** Absent once the seat is taken: the link is destroyed, not just refused. */
  url?: string
  claimed: boolean
}
