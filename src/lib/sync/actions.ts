'use server'

import { randomBytes, randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb, isDatabaseConfigured } from '@/db/client'
import {
  expensePayers,
  expenseShares,
  expenses,
  groups,
  participants,
  settlements,
} from '@/db/schema'
import type { GroupPayload, JoinLink } from './payload'

const DEVICE_COOKIE = 'baaki-device'

type Db = ReturnType<typeof getDb>

/**
 * Who this browser is, as far as the server is concerned.
 *
 * There are no accounts yet, so a device is the whole of identity: an opaque
 * random id the browser keeps and the server compares. Set the first time a
 * device shares or joins, never derived from anything about the person, and
 * meaningless outside this app.
 */
async function deviceId(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(DEVICE_COOKIE)?.value
  if (existing) return existing

  const fresh = randomUUID()
  jar.set(DEVICE_COOKIE, fresh, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365 * 5,
    path: '/',
  })
  return fresh
}

/**
 * Where a join link should point.
 *
 * The request wins over the configured origin, not the other way round. A link
 * is handed to somebody on another device, so the one address guaranteed to
 * reach this server is the one the browser just used: localhost only when the
 * page really was opened on localhost, the preview domain on a preview
 * deployment, the real domain in production. A configured origin is the
 * fallback for the case where there is no request to learn from.
 */
async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const proto =
      h.get('x-forwarded-proto') ??
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

/** 24 bytes, url-safe. Long enough that guessing one is not a strategy. */
const newToken = () => randomBytes(24).toString('base64url')

export interface ShareResult {
  ok: boolean
  message?: string
  links?: JoinLink[]
  /** The local id of the person this device took, if it took one. */
  meId?: string
}

/**
 * Push a group to the server and mint one join link per person.
 *
 * Idempotent. Every row is keyed on the id it already had on the device that
 * made it, so sharing twice updates rather than duplicates and a link already
 * handed out keeps working.
 */
export async function shareGroup(
  payload: GroupPayload,
  meLocalId: string,
): Promise<ShareResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, message: 'No database is configured for this deployment.' }
  }

  const db = getDb()
  const me = await deviceId()
  const base = await origin()
  const { group } = payload

  try {
    const seats = await db.transaction(async (tx) => {
      await tx
        .insert(groups)
        .values({
          localId: group.id,
          name: group.name,
          currency: group.currency,
          simplify: group.simplify,
          ownerDeviceId: me,
        })
        .onConflictDoNothing()

      const [existing] = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.localId, group.id))
        .limit(1)
      if (!existing) throw new Error('the group could not be created')
      const serverGroupId = existing.id

      await tx
        .update(groups)
        .set({ name: group.name, currency: group.currency, simplify: group.simplify })
        .where(eq(groups.id, serverGroupId))

      for (const person of payload.people) {
        await tx
          .insert(participants)
          .values({
            groupId: serverGroupId,
            localId: person.id,
            displayName: person.name,
            vpa: person.vpa ?? null,
            /**
             * The sharing device takes its own seat immediately and gets no
             * link at all. A token for a seat that is already taken is a live
             * bearer secret guarding nothing.
             */
            ...(person.id === meLocalId
              ? { claimToken: null, claimedAt: new Date(), deviceId: me }
              : { claimToken: newToken() }),
          })
          .onConflictDoUpdate({
            target: [participants.groupId, participants.localId],
            // A claim already made is never overwritten by a later push.
            set: { displayName: person.name, vpa: person.vpa ?? null },
          })
      }

      const rows = await tx
        .select({
          id: participants.id,
          localId: participants.localId,
          displayName: participants.displayName,
          claimToken: participants.claimToken,
          claimedAt: participants.claimedAt,
          deviceId: participants.deviceId,
        })
        .from(participants)
        .where(eq(participants.groupId, serverGroupId))

      const seatByLocal = new Map(rows.map((r) => [r.localId, r.id]))

      for (const expense of payload.expenses) {
        const [row] = await tx
          .insert(expenses)
          .values({
            groupId: serverGroupId,
            localId: expense.id,
            description: expense.description,
            category: expense.category,
            occurredOn: expense.occurredOn,
            splitMode: expense.splitMode,
            currency: group.currency,
            originalCurrency: expense.original?.currency ?? null,
            originalMinor: expense.original ? BigInt(expense.original.minor) : null,
            originalRate: expense.original?.rateToGroupCurrency ?? null,
          })
          .onConflictDoUpdate({
            target: [expenses.groupId, expenses.localId],
            /**
             * deletedAt is deliberately not cleared. A device that has not
             * pulled since somebody deleted a bill still has it locally, and
             * clearing the tombstone on push would resurrect it on everyone's
             * phone. Deletes travel as their own operation.
             */
            set: {
              description: expense.description,
              category: expense.category,
              occurredOn: expense.occurredOn,
              splitMode: expense.splitMode,
            },
          })
          .returning({ id: expenses.id })

        const expenseId = row.id

        /**
         * Rewritten wholesale rather than diffed. The balance trigger fires at
         * commit, not per statement, so an expense may be momentarily
         * unbalanced inside this transaction and never once it lands.
         */
        await tx.delete(expensePayers).where(eq(expensePayers.expenseId, expenseId))
        await tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId))

        for (const p of expense.payers) {
          const seat = seatByLocal.get(p.personId)
          if (!seat) throw new Error(`somebody who paid for "${expense.description}" is not in the group`)
          await tx
            .insert(expensePayers)
            .values({ expenseId, participantId: seat, amountMinor: BigInt(p.minor) })
        }
        for (const s of expense.shares) {
          const seat = seatByLocal.get(s.personId)
          if (!seat) throw new Error(`somebody sharing "${expense.description}" is not in the group`)
          await tx
            .insert(expenseShares)
            .values({ expenseId, participantId: seat, amountMinor: BigInt(s.minor) })
        }
      }

      for (const s of payload.settlements) {
        const from = seatByLocal.get(s.fromId)
        const to = seatByLocal.get(s.toId)
        if (!from || !to) continue
        await tx
          .insert(settlements)
          .values({
            groupId: serverGroupId,
            localId: s.id,
            fromParticipantId: from,
            toParticipantId: to,
            amountMinor: BigInt(s.minor),
            currency: group.currency,
            method: s.method,
            status: s.status,
          })
          .onConflictDoUpdate({
            target: [settlements.groupId, settlements.localId],
            /**
             * Only a proposal can still change. Once the payee has confirmed or
             * disputed, that is the answer, and a push from a device that has
             * not pulled since must not undo it. This is the one race in the
             * sync loop that would move money, so it is closed in SQL rather
             * than by hoping the client pulls first.
             */
            set: {
              amountMinor: BigInt(s.minor),
              status: sql`case when ${settlements.status} = 'proposed'
                          then excluded.status else ${settlements.status} end`,
            },
          })
      }

      return rows
    })

    return {
      ok: true,
      meId: meLocalId,
      links: seats.map((seat) => ({
        personId: seat.localId,
        name: seat.displayName,
        claimed: Boolean(seat.claimedAt),
        ...(seat.claimToken ? { url: `${base}/join/${seat.claimToken}` } : {}),
      })),
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The group could not be shared.',
    }
  }
}

export interface ClaimPreview {
  ok: boolean
  message?: string
  groupName?: string
  personName?: string
  /** True when this very device already holds the seat. */
  mine?: boolean
  /** True when somebody else got here first. */
  taken?: boolean
  /** The name this device already holds in that group, if it holds one. */
  alreadyIn?: string
}

/** What a join link shows before anyone commits to it. */
export async function previewClaim(token: string): Promise<ClaimPreview> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const me = await deviceId()

  const [seat] = await db
    .select({
      groupId: participants.groupId,
      displayName: participants.displayName,
      claimedAt: participants.claimedAt,
      deviceId: participants.deviceId,
      groupName: groups.name,
    })
    .from(participants)
    .innerJoin(groups, eq(groups.id, participants.groupId))
    .where(eq(participants.claimToken, token))
    .limit(1)

  if (!seat) return { ok: false, message: 'That link is not valid.' }

  return {
    ok: true,
    groupName: seat.groupName,
    personName: seat.displayName,
    mine: seat.deviceId === me,
    taken: Boolean(seat.claimedAt) && seat.deviceId !== me,
    alreadyIn: await otherSeatOn(db, seat.groupId, me, token),
  }
}

/**
 * The name this device already goes by in a group, if any.
 *
 * One device is one person per group. Without this, opening a second link on
 * the same phone would quietly make you two people in the same ledger, and both
 * of you could confirm the other's payments.
 */
async function otherSeatOn(
  db: Db,
  groupId: string,
  device: string,
  exceptToken: string,
): Promise<string | undefined> {
  const [held] = await db
    .select({ displayName: participants.displayName, claimToken: participants.claimToken })
    .from(participants)
    .where(and(eq(participants.groupId, groupId), eq(participants.deviceId, device)))
    .limit(1)
  return held && held.claimToken !== exceptToken ? held.displayName : undefined
}

export interface PullResult {
  ok: boolean
  message?: string
  payload?: GroupPayload
  /** The local id of the person this device is in that group. */
  meId?: string
}

/**
 * Take a seat, and come back with the whole group.
 *
 * A seat binds to the first device that claims it and stays bound. That is the
 * whole security model right now and it is worth saying plainly: the link is
 * the credential, so whoever holds it before the seat is taken can become that
 * person. It buys joining with no account, no email and no app install, and
 * what it risks is a shared expense ledger, never money.
 */
export async function claimSeat(token: string): Promise<PullResult> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const me = await deviceId()

  const [seat] = await db
    .select({
      id: participants.id,
      groupId: participants.groupId,
      localId: participants.localId,
      claimedAt: participants.claimedAt,
      deviceId: participants.deviceId,
    })
    .from(participants)
    .where(eq(participants.claimToken, token))
    .limit(1)

  if (!seat) return { ok: false, message: 'That link is not valid.' }
  if (seat.claimedAt && seat.deviceId !== me) {
    return { ok: false, message: 'Somebody has already joined with this link.' }
  }

  const held = await otherSeatOn(db, seat.groupId, me, token)
  if (held) {
    return {
      ok: false,
      message: `This device is already ${held} in that group.`,
    }
  }

  if (!seat.claimedAt) {
    /**
     * The token is destroyed, not just marked used. A link is a bearer secret,
     * and the seat is bound to the device from here on, so keeping the secret
     * around only leaves something to leak out of a chat history later.
     */
    await db
      .update(participants)
      .set({ claimedAt: new Date(), deviceId: me, claimToken: null })
      .where(eq(participants.id, seat.id))
  }

  const payload = await readGroup(db, seat.groupId)
  if (!payload) return { ok: false, message: 'That group could not be read.' }
  return { ok: true, payload, meId: seat.localId }
}

/** Pull the current server copy of a group this device already belongs to. */
export async function pullGroup(localGroupId: string): Promise<PullResult> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const me = await deviceId()

  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.localId, localGroupId))
    .limit(1)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const [seat] = await db
    .select({ localId: participants.localId })
    .from(participants)
    .where(and(eq(participants.groupId, group.id), eq(participants.deviceId, me)))
    .limit(1)

  const payload = await readGroup(db, group.id)
  if (!payload) return { ok: false, message: 'That group could not be read.' }
  return { ok: true, payload, meId: seat?.localId }
}

/** Read a whole group back out, in the shape the device stores it in. */
async function readGroup(db: Db, serverGroupId: string): Promise<GroupPayload | null> {
  const [group] = await db.select().from(groups).where(eq(groups.id, serverGroupId)).limit(1)
  if (!group) return null

  const seats = await db
    .select()
    .from(participants)
    .where(eq(participants.groupId, serverGroupId))
  const seatLocal = new Map(seats.map((s) => [s.id, s.localId]))

  const bills = (
    await db.select().from(expenses).where(eq(expenses.groupId, serverGroupId))
  ).filter((b) => !b.deletedAt)
  const ids = bills.map((b) => b.id)

  const payers = ids.length
    ? await db.select().from(expensePayers).where(inArray(expensePayers.expenseId, ids))
    : []
  const shares = ids.length
    ? await db.select().from(expenseShares).where(inArray(expenseShares.expenseId, ids))
    : []
  const paid = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.groupId, serverGroupId), isNull(settlements.deletedAt)))

  return {
    group: {
      id: group.localId,
      name: group.name,
      currency: group.currency,
      simplify: group.simplify,
      memberIds: seats.map((s) => s.localId),
      createdAt: group.createdAt.toISOString(),
    },
    people: seats.map((s) => ({
      id: s.localId,
      name: s.displayName,
      ...(s.vpa ? { vpa: s.vpa } : {}),
    })),
    expenses: bills.map((bill) => ({
      id: bill.localId,
      groupId: group.localId,
      description: bill.description,
      category: bill.category,
      occurredOn: bill.occurredOn,
      splitMode: bill.splitMode as GroupPayload['expenses'][number]['splitMode'],
      payers: payers
        .filter((p) => p.expenseId === bill.id)
        .map((p) => ({
          personId: seatLocal.get(p.participantId) ?? '',
          minor: p.amountMinor.toString(),
        })),
      shares: shares
        .filter((s) => s.expenseId === bill.id)
        .map((s) => ({
          personId: seatLocal.get(s.participantId) ?? '',
          minor: s.amountMinor.toString(),
        })),
      createdAt: bill.createdAt.toISOString(),
    })),
    settlements: paid.map((s) => ({
      id: s.localId,
      groupId: group.localId,
      fromId: seatLocal.get(s.fromParticipantId) ?? '',
      toId: seatLocal.get(s.toParticipantId) ?? '',
      minor: s.amountMinor.toString(),
      method: s.method,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
  }
}

/** The seat this device holds in a group, or null if it holds none. */
async function seatOf(db: Db, serverGroupId: string, device: string) {
  const [seat] = await db
    .select({ id: participants.id, localId: participants.localId })
    .from(participants)
    .where(and(eq(participants.groupId, serverGroupId), eq(participants.deviceId, device)))
    .limit(1)
  return seat ?? null
}

async function serverGroup(db: Db, localGroupId: string) {
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.localId, localGroupId))
    .limit(1)
  return group ?? null
}

/** Mark a bill deleted for everyone. Tombstoned, never removed, so a peer that has not pulled cannot bring it back. */
export async function removeExpense(localGroupId: string, expenseLocalId: string) {
  if (!isDatabaseConfigured()) return { ok: false as const }
  const db = getDb()
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false as const }

  await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(and(eq(expenses.groupId, group.id), eq(expenses.localId, expenseLocalId)))
  return { ok: true as const }
}

/** Withdraw a payment somebody said they made. Same tombstone rule. */
export async function removeSettlement(localGroupId: string, settlementLocalId: string) {
  if (!isDatabaseConfigured()) return { ok: false as const }
  const db = getDb()
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false as const }

  await db
    .update(settlements)
    .set({ deletedAt: new Date() })
    .where(and(eq(settlements.groupId, group.id), eq(settlements.localId, settlementLocalId)))
  return { ok: true as const }
}

/**
 * Answer a payment somebody says they made to you.
 *
 * The server checks who is asking rather than trusting the client to only
 * offer the button to the right person. Confirming a payment is the act that
 * moves a balance, so it is the one place where "this device is that seat" has
 * to be proven on the server or it means nothing.
 */
export async function answerSettlement(
  localGroupId: string,
  settlementLocalId: string,
  answer: 'confirmed' | 'disputed',
): Promise<{ ok: boolean; message?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const me = await deviceId()
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const seat = await seatOf(db, group.id, me)
  if (!seat) return { ok: false, message: 'This device is not in that group.' }

  const [row] = await db
    .select({ id: settlements.id, toParticipantId: settlements.toParticipantId, status: settlements.status })
    .from(settlements)
    .where(and(eq(settlements.groupId, group.id), eq(settlements.localId, settlementLocalId)))
    .limit(1)

  if (!row) return { ok: false, message: 'That payment is not on the server yet.' }
  if (row.toParticipantId !== seat.id) {
    return { ok: false, message: 'Only the person who was paid can answer this.' }
  }
  if (row.status !== 'proposed') {
    return { ok: false, message: 'That payment has already been answered.' }
  }

  await db
    .update(settlements)
    .set({ status: answer, confirmedAt: new Date() })
    .where(eq(settlements.id, row.id))
  return { ok: true }
}

/**
 * Issue a fresh join link for somebody, releasing whatever device held it.
 *
 * The lost-phone case. Only the device that shared the group may do this: a
 * seat is somebody's identity in the ledger, so letting any member reset any
 * seat would let one member take another's place.
 */
export async function reissueLink(
  localGroupId: string,
  personLocalId: string,
): Promise<{ ok: boolean; message?: string; url?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const me = await deviceId()
  const base = await origin()

  const [group] = await db
    .select({ id: groups.id, ownerDeviceId: groups.ownerDeviceId })
    .from(groups)
    .where(eq(groups.localId, localGroupId))
    .limit(1)
  if (!group) return { ok: false, message: 'That group is not shared.' }
  if (group.ownerDeviceId !== me) {
    return { ok: false, message: 'Only the device that shared this group can send a new link.' }
  }

  const token = newToken()
  const changed = await db
    .update(participants)
    .set({ claimToken: token, claimedAt: null, deviceId: null })
    .where(and(eq(participants.groupId, group.id), eq(participants.localId, personLocalId)))
    .returning({ id: participants.id })

  if (changed.length === 0) return { ok: false, message: 'That person is not in the group.' }
  return { ok: true, url: `${base}/join/${token}` }
}
