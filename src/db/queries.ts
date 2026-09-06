import { and, eq, isNull } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'
import type { ExpenseEntry, ParticipantRef, SettlementEntry } from '../lib/ledger/types'
import { money, type Money } from '../lib/money'

/**
 * The data layer, written against Drizzle's database interface rather than a
 * concrete driver, so the same functions run on Postgres in production and on
 * an in-process Postgres in the tests. There is no mock anywhere.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const refOf = (participantId: string) => `user:${participantId}` as ParticipantRef

export interface NewGroup {
  name: string
  currency: string
  /** Names of everyone in it. Accounts are optional; a name is enough. */
  members: { displayName: string; userId?: string }[]
  createdBy?: string
}

export async function createGroup(db: Db, input: NewGroup) {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(schema.groups)
      .values({
        name: input.name.trim() || 'New group',
        currency: input.currency,
        createdBy: input.createdBy,
      })
      .returning()

    const participants = await tx
      .insert(schema.participants)
      .values(
        input.members.map((member) => ({
          groupId: group.id,
          userId: member.userId,
          displayName: member.displayName.trim(),
        })),
      )
      .returning()

    return { group, participants }
  })
}

export async function addParticipant(
  db: Db,
  groupId: string,
  displayName: string,
  userId?: string,
) {
  const [participant] = await db
    .insert(schema.participants)
    .values({ groupId, displayName: displayName.trim(), userId })
    .returning()
  return participant
}

export interface NewExpense {
  groupId: string
  description: string
  category?: string
  occurredOn?: string
  splitMode?: string
  currency: string
  payers: { participantId: string; minor: bigint }[]
  shares: { participantId: string; minor: bigint }[]
  original?: { currency: string; minor: bigint; rate: string }
  createdBy?: string
}

/**
 * Writes an expense and its two sides in one transaction.
 *
 * The balance trigger is deferred to commit, so a mismatch surfaces here as a
 * failed transaction rather than a half written expense.
 */
export async function addExpense(db: Db, input: NewExpense) {
  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(schema.expenses)
      .values({
        groupId: input.groupId,
        description: input.description.trim() || 'Expense',
        category: input.category ?? 'General',
        ...(input.occurredOn ? { occurredOn: input.occurredOn } : {}),
        splitMode: input.splitMode ?? 'equal',
        currency: input.currency,
        originalCurrency: input.original?.currency,
        originalMinor: input.original?.minor,
        originalRate: input.original?.rate,
        createdBy: input.createdBy,
      })
      .returning()

    if (input.payers.length > 0) {
      await tx.insert(schema.expensePayers).values(
        input.payers.map((p) => ({
          expenseId: expense.id,
          participantId: p.participantId,
          amountMinor: p.minor,
        })),
      )
    }

    if (input.shares.length > 0) {
      await tx.insert(schema.expenseShares).values(
        input.shares.map((s) => ({
          expenseId: expense.id,
          participantId: s.participantId,
          amountMinor: s.minor,
        })),
      )
    }

    return expense
  })
}

export async function softDeleteExpense(db: Db, expenseId: string) {
  await db
    .update(schema.expenses)
    .set({ deletedAt: new Date() })
    .where(eq(schema.expenses.id, expenseId))
}

export async function proposeSettlement(
  db: Db,
  input: {
    groupId: string
    fromParticipantId: string
    toParticipantId: string
    minor: bigint
    currency: string
    method?: 'upi' | 'cash' | 'bank' | 'other'
    initiatedBy?: string
  },
) {
  const [settlement] = await db
    .insert(schema.settlements)
    .values({
      groupId: input.groupId,
      fromParticipantId: input.fromParticipantId,
      toParticipantId: input.toParticipantId,
      amountMinor: input.minor,
      currency: input.currency,
      method: input.method ?? 'other',
    })
    .returning()
  return settlement
}

/**
 * Only the payee closes a settlement.
 *
 * The payer says they paid; that is a claim, and a claim is not a payment.
 * Passing the confirming user lets the caller enforce who is allowed to.
 */
export async function setSettlementStatus(
  db: Db,
  settlementId: string,
  status: 'confirmed' | 'disputed',
  confirmedBy?: string,
) {
  const [settlement] = await db
    .update(schema.settlements)
    .set({
      status,
      confirmedBy,
      confirmedAt: status === 'confirmed' ? new Date() : null,
    })
    .where(eq(schema.settlements.id, settlementId))
    .returning()
  return settlement
}

export interface GroupLedgerRows {
  group: typeof schema.groups.$inferSelect
  participants: (typeof schema.participants.$inferSelect)[]
  entries: ExpenseEntry[]
  settlements: SettlementEntry[]
}

/**
 * Everything needed to compute balances, in the shape the ledger functions
 * already take. Balances themselves are never stored: they are derived from
 * this history by the same code the property tests cover.
 */
export async function loadGroupLedger(
  db: Db,
  groupId: string,
): Promise<GroupLedgerRows | null> {
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId))
  if (!group) return null

  const people = await db
    .select()
    .from(schema.participants)
    .where(eq(schema.participants.groupId, groupId))

  const expenseRows = await db
    .select()
    .from(schema.expenses)
    .where(and(eq(schema.expenses.groupId, groupId), isNull(schema.expenses.deletedAt)))

  const payerRows = await db
    .select({
      expenseId: schema.expensePayers.expenseId,
      participantId: schema.expensePayers.participantId,
      amountMinor: schema.expensePayers.amountMinor,
    })
    .from(schema.expensePayers)
    .innerJoin(schema.expenses, eq(schema.expenses.id, schema.expensePayers.expenseId))
    .where(eq(schema.expenses.groupId, groupId))

  const shareRows = await db
    .select({
      expenseId: schema.expenseShares.expenseId,
      participantId: schema.expenseShares.participantId,
      amountMinor: schema.expenseShares.amountMinor,
    })
    .from(schema.expenseShares)
    .innerJoin(schema.expenses, eq(schema.expenses.id, schema.expenseShares.expenseId))
    .where(eq(schema.expenses.groupId, groupId))

  const settlementRows = await db
    .select()
    .from(schema.settlements)
    .where(eq(schema.settlements.groupId, groupId))

  const group_ = group
  const bucket = (rows: typeof payerRows) => {
    const byExpense = new Map<string, { ref: ParticipantRef; amount: Money }[]>()
    for (const row of rows) {
      const list = byExpense.get(row.expenseId) ?? []
      list.push({
        ref: refOf(row.participantId),
        amount: money(row.amountMinor, group_.currency),
      })
      byExpense.set(row.expenseId, list)
    }
    return byExpense
  }

  const payersByExpense = bucket(payerRows)
  const sharesByExpense = bucket(shareRows)

  const entries: ExpenseEntry[] = expenseRows.map((expense) => ({
    id: expense.id,
    description: expense.description,
    payers: payersByExpense.get(expense.id) ?? [],
    shares: sharesByExpense.get(expense.id) ?? [],
  }))

  const settlements: SettlementEntry[] = settlementRows.map((row) => ({
    id: row.id,
    from: refOf(row.fromParticipantId),
    to: refOf(row.toParticipantId),
    amount: money(row.amountMinor, row.currency),
    status: row.status,
  }))

  return { group, participants: people, entries, settlements }
}
