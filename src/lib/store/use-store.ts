'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { netBalances, pairwiseDebts } from '../ledger/balances'
import { simplify } from '../ledger/simplify'
import type {
  ExpenseEntry,
  ParticipantRef,
  Provenance,
  SettlementEntry,
  Transfer,
} from '../ledger/types'
import { money, zero, type Money } from '../money'
import { getServerState, getState, subscribe } from './store'
import type { AppState, Expense, Group, Person, Settlement } from './types'

/** People and ledger participants are the same thing wearing different labels. */
export const refOf = (personId: string) => `user:${personId}` as ParticipantRef
export const personIdOf = (ref: ParticipantRef) => ref.slice(ref.indexOf(':') + 1)

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getServerState)
}

export interface MemberBalance {
  person: Person
  /** Signed: positive means the group owes them. */
  net: Money
}

export interface GroupLedger {
  group: Group | undefined
  members: Person[]
  me: Person | undefined
  expenses: Expense[]
  settlements: Settlement[]
  /** Signed net for every member, largest creditor first. */
  balances: MemberBalance[]
  /** Your position with each other member, signed from your side. */
  yourSplit: { person: Person; amount: Money }[]
  yourNet: Money
  transfers: Transfer[]
  provenance: Provenance[]
  /** How many payments the group would take without simplification. */
  pairwiseCount: number
  nameOf: (personId: string) => string
  personOf: (personId: string) => Person | undefined
}

/**
 * Everything a group screen needs, derived from stored rows on every render.
 *
 * Balances are never stored - they are recomputed from the expense and
 * settlement history by the same functions the tests cover. There is no second
 * source of truth to drift.
 */
export function useGroupLedger(groupId: string): GroupLedger {
  const state = useAppState()

  return useMemo(() => {
    const group = state.groups.find((g) => g.id === groupId)
    const currency = group?.currency ?? 'INR'
    const byId = new Map(state.people.map((p) => [p.id, p]))
    const members = (group?.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Person => Boolean(p))

    const expenses = state.expenses.filter((e) => e.groupId === groupId)
    const settlements = state.settlements.filter((s) => s.groupId === groupId)

    const entries: ExpenseEntry[] = expenses.map((e) => ({
      id: e.id,
      description: e.description,
      payers: e.payers.map((p) => ({
        ref: refOf(p.personId),
        amount: money(BigInt(p.minor), currency),
      })),
      shares: e.shares.map((s) => ({
        ref: refOf(s.personId),
        amount: money(BigInt(s.minor), currency),
      })),
    }))

    const settlementEntries: SettlementEntry[] = settlements.map((s) => ({
      id: s.id,
      from: refOf(s.fromId),
      to: refOf(s.toId),
      amount: money(BigInt(s.minor), currency),
      status: s.status,
    }))

    const net = netBalances(entries, settlementEntries, currency)
    const edges = pairwiseDebts(entries, settlementEntries, currency)
    const { transfers, provenance } = simplify(net, edges, currency)

    const balances: MemberBalance[] = members
      .map((person) => ({ person, net: net.get(refOf(person.id)) ?? zero(currency) }))
      .sort((a, b) => (b.net.minor > a.net.minor ? 1 : b.net.minor < a.net.minor ? -1 : 0))

    const meRef = refOf(state.meId)
    const yourSplit = edges
      .filter((e) => e.from === meRef || e.to === meRef)
      .map((e) => {
        const otherId = personIdOf(e.from === meRef ? e.to : e.from)
        return {
          person: byId.get(otherId) ?? { id: otherId, name: 'Someone' },
          // Negative when you are the one who owes.
          amount: e.from === meRef ? money(-e.amount.minor, currency) : e.amount,
        }
      })
      .sort((a, b) => Number(absMinor(b.amount) - absMinor(a.amount)))

    return {
      group,
      members,
      me: byId.get(state.meId),
      expenses,
      settlements,
      balances,
      yourSplit,
      yourNet: net.get(meRef) ?? zero(currency),
      transfers,
      provenance,
      pairwiseCount: edges.length,
      nameOf: (id) => byId.get(id)?.name ?? 'Someone',
      personOf: (id) => byId.get(id),
    }
  }, [state, groupId])
}

function absMinor(m: Money): bigint {
  return m.minor < 0n ? -m.minor : m.minor
}

/** Totals across every group, for the home screen. */
export function useGroupSummaries() {
  const state = useAppState()

  return useMemo(() => {
    return state.groups.map((group) => {
      const byId = new Map(state.people.map((p) => [p.id, p]))
      const entries: ExpenseEntry[] = state.expenses
        .filter((e) => e.groupId === group.id)
        .map((e) => ({
          id: e.id,
          payers: e.payers.map((p) => ({
            ref: refOf(p.personId),
            amount: money(BigInt(p.minor), group.currency),
          })),
          shares: e.shares.map((s) => ({
            ref: refOf(s.personId),
            amount: money(BigInt(s.minor), group.currency),
          })),
        }))

      const settlementEntries: SettlementEntry[] = state.settlements
        .filter((s) => s.groupId === group.id)
        .map((s) => ({
          id: s.id,
          from: refOf(s.fromId),
          to: refOf(s.toId),
          amount: money(BigInt(s.minor), group.currency),
          status: s.status,
        }))

      const net = netBalances(entries, settlementEntries, group.currency)
      return {
        group,
        members: group.memberIds
          .map((id) => byId.get(id))
          .filter((p): p is Person => Boolean(p)),
        expenseCount: entries.length,
        yourNet: net.get(refOf(state.meId)) ?? zero(group.currency),
      }
    })
  }, [state])
}
