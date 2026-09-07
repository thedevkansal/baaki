'use client'

import type { SplitMode } from '../split'
import type { Repeat } from '../recurring'
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


/**
 * What a shared group does after a local write.
 *
 * The store stays synchronous and offline-first; anything to do with the
 * network is registered from outside and is free to fail. A write always lands
 * locally first, so a push that never happens costs a sync, not the data.
 */
export type SyncEvent =
  | { kind: 'changed'; groupId: string }
  | { kind: 'expense-deleted'; groupId: string; id: string }
  | { kind: 'settlement-deleted'; groupId: string; id: string }

let syncHandler: ((event: SyncEvent) => void) | null = null

export function setSyncHandler(fn: ((event: SyncEvent) => void) | null) {
  syncHandler = fn
}

function synced(event: SyncEvent) {
  const group = load().groups.find((g) => g.id === event.groupId)
  if (group?.shared) syncHandler?.(event)
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

/**
 * Take somebody out of a group.
 *
 * Refused once they appear on a bill or a payment: removing them then would
 * either delete history or leave a balance owed to nobody. Names can be fixed
 * by renaming instead, which is why this is only for the ones added by mistake.
 */
export function removePersonFromGroup(
  groupId: string,
  personId: string,
): { removed: boolean; reason?: string } {
  const current = load()
  const involved =
    current.expenses.some(
      (e) =>
        e.groupId === groupId &&
        (e.payers.some((p) => p.personId === personId) ||
          e.shares.some((s) => s.personId === personId && BigInt(s.minor) !== 0n)),
    ) ||
    current.settlements.some(
      (s) => s.groupId === groupId && (s.fromId === personId || s.toId === personId),
    )

  if (involved) {
    return { removed: false, reason: 'They are on a bill or a payment in this group.' }
  }
  if (personId === current.meId) {
    return { removed: false, reason: 'You cannot remove yourself from your own group.' }
  }

  commit({
    ...current,
    groups: current.groups.map((g) =>
      g.id === groupId
        ? { ...g, memberIds: g.memberIds.filter((id) => id !== personId) }
        : g,
    ),
  })
  return { removed: true }
}

/** Rename anybody, including yourself. */
export function renamePerson(personId: string, name: string) {
  const current = load()
  const trimmed = name.trim()
  if (!trimmed) return
  commit({
    ...current,
    people: current.people.map((p) => (p.id === personId ? { ...p, name: trimmed } : p)),
  })
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
  repeat?: Repeat
  repeatOf?: string
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
    repeat: draft.repeat,
    repeatOf: draft.repeatOf,
    original: draft.original && {
      currency: draft.original.currency,
      minor: draft.original.minor.toString(),
      rateToGroupCurrency: draft.original.rateToGroupCurrency,
    },
    createdAt: new Date().toISOString(),
  }
  commit({ ...current, expenses: [expense, ...current.expenses] })
  synced({ kind: 'changed', groupId: draft.groupId })
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
            repeat: draft.repeat,
            repeatOf: draft.repeatOf,
            original: draft.original && {
              currency: draft.original.currency,
              minor: draft.original.minor.toString(),
              rateToGroupCurrency: draft.original.rateToGroupCurrency,
            },
          }
        : expense,
    ),
  })
  synced({ kind: 'changed', groupId: draft.groupId })
}

export function deleteExpense(expenseId: string) {
  const current = load()
  const doomed = current.expenses.find((e) => e.id === expenseId)
  commit({ ...current, expenses: current.expenses.filter((e) => e.id !== expenseId) })
  if (doomed) {
    synced({ kind: 'expense-deleted', groupId: doomed.groupId, id: expenseId })
  }
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
  synced({ kind: 'changed', groupId: input.groupId })
  return settlement
}

export function setSettlementStatus(settlementId: string, status: Settlement['status']) {
  const current = load()
  const target = current.settlements.find((s) => s.id === settlementId)
  commit({
    ...current,
    settlements: current.settlements.map((s) =>
      s.id === settlementId ? { ...s, status } : s,
    ),
  })
  if (target) synced({ kind: 'changed', groupId: target.groupId })
}

export function deleteSettlement(settlementId: string) {
  const current = load()
  const doomed = current.settlements.find((s) => s.id === settlementId)
  commit({
    ...current,
    settlements: current.settlements.filter((s) => s.id !== settlementId),
  })
  if (doomed) {
    synced({ kind: 'settlement-deleted', groupId: doomed.groupId, id: settlementId })
  }
}

/**
 * Bring a group over from a Splitwise export.
 *
 * `meName` says which of the exported people is the person doing the import,
 * so their existing identity is reused rather than a duplicate of themselves
 * being created alongside it.
 */
export function importGroup(input: {
  name: string
  currency: string
  people: string[]
  meName: string
  rows: {
    date: string
    description: string
    category: string
    payers: { name: string; minor: bigint }[]
    shares: { name: string; minor: bigint }[]
  }[]
}): Group {
  const current = load()

  const idByName = new Map<string, string>()
  const created: Person[] = []
  for (const name of input.people) {
    if (name === input.meName) {
      idByName.set(name, current.meId)
      continue
    }
    const person = { id: newId('p'), name }
    created.push(person)
    idByName.set(name, person.id)
  }

  const group: Group = {
    id: newId('g'),
    name: input.name.trim() || 'Imported group',
    currency: input.currency,
    memberIds: input.people.map((name) => idByName.get(name)!),
    createdAt: new Date().toISOString(),
    simplify: true,
  }

  const expenses: Expense[] = input.rows.map((row) => ({
    id: newId('e'),
    groupId: group.id,
    description: row.description,
    category: row.category,
    occurredOn: row.date,
    splitMode: 'equal',
    payers: row.payers.map((p) => ({
      personId: idByName.get(p.name)!,
      minor: p.minor.toString(),
    })),
    shares: row.shares.map((s) => ({
      personId: idByName.get(s.name)!,
      minor: s.minor.toString(),
    })),
    createdAt: new Date().toISOString(),
  }))

  commit({
    ...current,
    people: [...current.people, ...created],
    groups: [...current.groups, group],
    expenses: [...expenses.reverse(), ...current.expenses],
  })

  return group
}

/**
 * A worked example, so an empty app can be judged on something.
 *
 * Real amounts, an uneven split, a bill somebody else paid and one in another
 * currency: enough that the balances, the charts and the settle flow all have
 * something to show without anyone having to type for five minutes first.
 */
/**
 * Replace this device's copy of one group with the server's.
 *
 * The server is authoritative for a shared group, so this is a replace rather
 * than a merge: anything local that the server does not have for this group is
 * dropped. Nothing outside the group is touched, and people are merged by id
 * rather than replaced, so somebody who is also in a local-only group keeps
 * their name there.
 */
export function applyPulledGroup(payload: {
  group: Group
  people: Person[]
  expenses: Expense[]
  settlements: Settlement[]
}, meId?: string) {
  const current = load()
  const groupId = payload.group.id

  const peopleById = new Map(current.people.map((p) => [p.id, p]))
  for (const person of payload.people) {
    peopleById.set(person.id, { ...peopleById.get(person.id), ...person })
  }

  const others = current.groups.filter((g) => g.id !== groupId)
  const pulled: Group = {
    ...payload.group,
    shared: { lastPulledAt: new Date().toISOString() },
  }

  commit({
    ...current,
    // A device that has claimed a seat *is* that person from then on.
    meId: meId ?? current.meId,
    people: [...peopleById.values()],
    groups: [...others, pulled],
    expenses: [
      ...current.expenses.filter((e) => e.groupId !== groupId),
      ...payload.expenses,
    ],
    settlements: [
      ...current.settlements.filter((s) => s.groupId !== groupId),
      ...payload.settlements,
    ],
  })
}

/** Note that a group now lives on the server too. */
export function markShared(groupId: string) {
  const current = load()
  commit({
    ...current,
    groups: current.groups.map((g) =>
      g.id === groupId ? { ...g, shared: { lastPulledAt: new Date().toISOString() } } : g,
    ),
  })
}

export function seedSampleGroup(): Group {
  const current = load()
  const priya = { id: newId('p'), name: 'Priya' }
  const rahul = { id: newId('p'), name: 'Rahul' }
  const aman = { id: newId('p'), name: 'Aman' }
  const me = current.meId

  const group: Group = {
    id: newId('g'),
    name: 'Goa trip',
    currency: 'INR',
    memberIds: [me, priya.id, rahul.id, aman.id],
    createdAt: new Date().toISOString(),
    simplify: true,
  }

  const day = (back: number) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)

  const split = (total: bigint, ids: string[]) => {
    const each = total / BigInt(ids.length)
    const remainder = total - each * BigInt(ids.length)
    return ids.map((personId, i) => ({
      personId,
      minor: (each + (BigInt(i) < remainder ? 1n : 0n)).toString(),
    }))
  }

  const everyone = group.memberIds
  const expenses: Expense[] = [
    {
      id: newId('e'),
      groupId: group.id,
      description: 'Beach house, three nights',
      category: 'Stay',
      occurredOn: day(6),
      splitMode: 'equal',
      payers: [{ personId: priya.id, minor: '1240000' }],
      shares: split(1240000n, everyone),
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('e'),
      groupId: group.id,
      description: 'Scooter rental',
      category: 'Travel',
      occurredOn: day(5),
      splitMode: 'equal',
      payers: [{ personId: me, minor: '240000' }],
      shares: split(240000n, [me, rahul.id, aman.id]),
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('e'),
      groupId: group.id,
      description: 'Dinner at Gunpowder',
      category: 'Food',
      occurredOn: day(4),
      splitMode: 'equal',
      payers: [
        { personId: aman.id, minor: '320000' },
        { personId: me, minor: '150000' },
      ],
      shares: split(470000n, everyone),
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('e'),
      groupId: group.id,
      description: 'Scuba diving',
      category: 'Entertainment',
      occurredOn: day(3),
      splitMode: 'equal',
      payers: [{ personId: rahul.id, minor: '880000' }],
      shares: split(880000n, [me, rahul.id]),
      original: { currency: 'USD', minor: '10000', rateToGroupCurrency: '88' },
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('e'),
      groupId: group.id,
      description: 'Airport cab',
      category: 'Travel',
      occurredOn: day(1),
      splitMode: 'equal',
      payers: [{ personId: priya.id, minor: '89000' }],
      shares: split(89000n, everyone),
      createdAt: new Date().toISOString(),
    },
  ]

  commit({
    ...current,
    people: [...current.people, priya, rahul, aman],
    groups: [...current.groups, group],
    expenses: [...expenses.reverse(), ...current.expenses],
  })

  return group
}

/**
 * Enter a repeat that has come due, copying the original bill onto a new date.
 *
 * Deliberately a copy rather than a reference: rent changes, and last March
 * should still read as what was actually paid in March.
 */
export function addDueOccurrences(seriesId: string, dates: string[]): number {
  const current = load()
  const template = current.expenses.find((e) => e.id === seriesId)
  if (!template || dates.length === 0) return 0

  const created: Expense[] = dates.map((occurredOn) => ({
    ...template,
    id: newId('e'),
    occurredOn,
    repeat: undefined,
    repeatOf: seriesId,
    createdAt: new Date().toISOString(),
  }))

  commit({ ...current, expenses: [...created, ...current.expenses] })
  return created.length
}

/** Wipe everything. Offered in settings, never automatic. */
export function resetEverything() {
  commit(emptyState())
}
