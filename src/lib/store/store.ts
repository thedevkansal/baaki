'use client'

import type { SplitMode } from '../split'
import type { AppState, Expense, Group, Person, Settlement } from './types'

const STORAGE_KEY = 'baaki-state-v1'

/**
 * A single client-side store, kept in localStorage.
 *
 * This is deliberately behind one narrow surface. When Postgres and auth land,
 * the reads and writes below get a server implementation and nothing in the UI
 * has to change - the shape of the data is already the shape of the schema.
 *
 * Until then: one device, no account, no network. Which is enough to actually
 * use the thing.
 */

function emptyState(): AppState {
  const meId = newId('p')
  return {
    version: 1,
    meId,
    people: [{ id: meId, name: 'You' }],
    groups: [],
    expenses: [],
    settlements: [],
  }
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `${prefix}_${random}`
}

let state: AppState | null = null
const listeners = new Set<() => void>()

function load(): AppState {
  if (state) return state
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      if (parsed?.version === 1 && Array.isArray(parsed.people)) {
        state = parsed
        return state
      }
    }
  } catch {
    // Corrupt or unreadable storage. Starting fresh beats crashing on boot.
  }
  state = emptyState()
  return state
}

function commit(next: AppState) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Out of quota or private mode: the session still works, it just won't last.
  }
  listeners.forEach((fn) => fn())
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getState(): AppState {
  return load()
}

/** The server has no localStorage, so it renders the empty shape. */
let serverState: AppState | null = null
export function getServerState(): AppState {
  serverState ??= {
    version: 1,
    meId: '',
    people: [],
    groups: [],
    expenses: [],
    settlements: [],
  }
  return serverState
}

// ---------------------------------------------------------------- mutations

export function setMyName(name: string) {
  const current = load()
  commit({
    ...current,
    people: current.people.map((p) =>
      p.id === current.meId ? { ...p, name: name.trim() || 'You' } : p,
    ),
  })
}

export function setPersonVpa(personId: string, vpa: string) {
  const current = load()
  commit({
    ...current,
    people: current.people.map((p) =>
      p.id === personId ? { ...p, vpa: vpa.trim() || undefined } : p,
    ),
  })
}

export function addPerson(name: string, groupId?: string): Person {
  const current = load()
  const person: Person = { id: newId('p'), name: name.trim() }
  const next: AppState = { ...current, people: [...current.people, person] }
  if (groupId) {
    next.groups = next.groups.map((g) =>
      g.id === groupId ? { ...g, memberIds: [...g.memberIds, person.id] } : g,
    )
  }
  commit(next)
  return person
}

export function createGroup(name: string, currency: string, memberIds: string[]): Group {
  const current = load()
  const group: Group = {
    id: newId('g'),
    name: name.trim() || 'New group',
    currency,
    memberIds,
    createdAt: new Date().toISOString(),
    simplify: true,
  }
  commit({ ...current, groups: [...current.groups, group] })
  return group
}

export function updateGroup(groupId: string, patch: Partial<Omit<Group, 'id'>>) {
  const current = load()
  commit({
    ...current,
    groups: current.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
  })
}

export function deleteGroup(groupId: string) {
  const current = load()
  commit({
    ...current,
    groups: current.groups.filter((g) => g.id !== groupId),
    expenses: current.expenses.filter((e) => e.groupId !== groupId),
    settlements: current.settlements.filter((s) => s.groupId !== groupId),
  })
}

export interface ExpenseDraft {
  groupId: string
  description: string
  category: string
  occurredOn: string
  splitMode: SplitMode
  payers: { personId: string; minor: bigint }[]
  shares: { personId: string; minor: bigint }[]
  splitValues?: Record<string, string>
  original?: { currency: string; minor: bigint; rateToGroupCurrency: string }
}

export function addExpense(draft: ExpenseDraft): Expense {
  const current = load()
  const expense: Expense = {
    id: newId('e'),
    groupId: draft.groupId,
    description: draft.description.trim() || 'Expense',
    category: draft.category,
    occurredOn: draft.occurredOn,
    splitMode: draft.splitMode,
    payers: draft.payers.map((p) => ({ personId: p.personId, minor: p.minor.toString() })),
    shares: draft.shares.map((s) => ({ personId: s.personId, minor: s.minor.toString() })),
    splitValues: draft.splitValues,
    original: draft.original && {
      currency: draft.original.currency,
      minor: draft.original.minor.toString(),
      rateToGroupCurrency: draft.original.rateToGroupCurrency,
    },
    createdAt: new Date().toISOString(),
  }
  commit({ ...current, expenses: [expense, ...current.expenses] })
  return expense
}

/** Replaces a bill in place, keeping its id and its position in the list. */
export function updateExpense(expenseId: string, draft: ExpenseDraft) {
  const current = load()
  commit({
    ...current,
    expenses: current.expenses.map((expense) =>
      expense.id === expenseId
        ? {
            ...expense,
            description: draft.description.trim() || 'Expense',
            category: draft.category,
            occurredOn: draft.occurredOn,
            splitMode: draft.splitMode,
            payers: draft.payers.map((p) => ({
              personId: p.personId,
              minor: p.minor.toString(),
            })),
            shares: draft.shares.map((s) => ({
              personId: s.personId,
              minor: s.minor.toString(),
            })),
            splitValues: draft.splitValues,
            original: draft.original && {
              currency: draft.original.currency,
              minor: draft.original.minor.toString(),
              rateToGroupCurrency: draft.original.rateToGroupCurrency,
            },
          }
        : expense,
    ),
  })
}

export function deleteExpense(expenseId: string) {
  const current = load()
  commit({ ...current, expenses: current.expenses.filter((e) => e.id !== expenseId) })
}

export function proposeSettlement(input: {
  groupId: string
  fromId: string
  toId: string
  minor: bigint
  method: Settlement['method']
}): Settlement {
  const current = load()
  const settlement: Settlement = {
    id: newId('s'),
    groupId: input.groupId,
    fromId: input.fromId,
    toId: input.toId,
    minor: input.minor.toString(),
    method: input.method,
    status: 'proposed',
    createdAt: new Date().toISOString(),
  }
  commit({ ...current, settlements: [settlement, ...current.settlements] })
  return settlement
}

export function setSettlementStatus(settlementId: string, status: Settlement['status']) {
  const current = load()
  commit({
    ...current,
    settlements: current.settlements.map((s) =>
      s.id === settlementId ? { ...s, status } : s,
    ),
  })
}

export function deleteSettlement(settlementId: string) {
  const current = load()
  commit({
    ...current,
    settlements: current.settlements.filter((s) => s.id !== settlementId),
  })
}

/** Wipe everything. Offered in settings, never automatic. */
export function resetEverything() {
  commit(emptyState())
}
