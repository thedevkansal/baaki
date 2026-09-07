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
  /** The one link for the whole group. */
  inviteUrl?: string
  /** Everybody in the group and whether they have turned up yet. */
  people?: JoinLink[]
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
      /**
       * One statement, with a real conflict target. This was
       * `onConflictDoNothing()` with none, which cannot conflict, so every
       * share inserted a second empty copy of the group and a later pull could
       * pick the empty one and report the group as having nothing in it.
       */
      const [row] = await tx
        .insert(groups)
        .values({
          localId: group.id,
          name: group.name,
          currency: group.currency,
          simplify: group.simplify,
          ownerDeviceId: me,
          inviteToken: newToken(),
        })
        .onConflictDoUpdate({
          target: groups.localId,
          // ownerDeviceId and inviteToken are never reassigned: whoever shared
          // it stays owner, and a link already sent out keeps working.
          set: { name: group.name, currency: group.currency, simplify: group.simplify },
        })
        .returning({ id: groups.id })

      if (!row) throw new Error('the group could not be created')
      const serverGroupId = row.id

      /**
       * A push may add people. It may not rewrite the ones already there.
       *
       * Everybody in a shared group pushes the whole group, so an unrestricted
       * upsert means the last person to add a bill silently overwrites
       * everyone's names and UPI IDs with whatever their own copy last saw.
       * A wrong VPA is money sent to a stranger, so this is not a merge
       * conflict to be resolved later, it is a thing that must not happen.
       *
       * Editing an existing row is done below, once, and only for rows this
       * device is allowed to touch.
       */
      for (const person of payload.people) {
        await tx
          .insert(participants)
          .values({
            groupId: serverGroupId,
            localId: person.id,
            displayName: person.name,
            vpa: person.vpa ?? null,
            // The sharing device takes its own seat on the spot; everybody
            // else arrives through the group's invite link.
            ...(person.id === meLocalId ? { claimedAt: new Date(), deviceId: me } : {}),
          })
          .onConflictDoNothing()
      }

      const mine = payload.people.find((person) => person.id === meLocalId)
      if (mine) {
        // Your own name and UPI ID, which are yours alone to set.
        await tx
          .update(participants)
          .set({ displayName: mine.name, vpa: mine.vpa ?? null })
          .where(
            and(
              eq(participants.groupId, serverGroupId),
              eq(participants.localId, meLocalId),
              eq(participants.deviceId, me),
            ),
          )
      }

      /**
       * The owner may still fix a name nobody has claimed: "p1" was a
       * placeholder for a person who has not turned up, and correcting it to
       * "Priya" before she does is the point of listing people at all.
       */
      const [owner] = await tx
        .select({ deviceId: groups.ownerDeviceId })
        .from(groups)
        .where(eq(groups.id, serverGroupId))
        .limit(1)

      if (owner?.deviceId === me) {
        for (const person of payload.people) {
          if (person.id === meLocalId) continue
          await tx
            .update(participants)
            .set({ displayName: person.name })
            .where(
              and(
                eq(participants.groupId, serverGroupId),
                eq(participants.localId, person.id),
                isNull(participants.claimedAt),
              ),
            )
        }
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

      const [withToken] = await tx
        .select({ inviteToken: groups.inviteToken })
        .from(groups)
        .where(eq(groups.id, serverGroupId))
        .limit(1)

      return { rows, inviteToken: withToken?.inviteToken ?? '' }
    })

    return {
      ok: true,
      inviteUrl: `${base}/join/${seats.inviteToken}`,
      people: seats.rows.map((seat) => ({
        personId: seat.localId,
        name: seat.displayName,
        claimed: Boolean(seat.claimedAt),
      })),
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The group could not be shared.',
    }
  }
}

export interface InvitePreview {
  ok: boolean
  message?: string
  groupName?: string
  /** Names already in the group that nobody has claimed yet. */
  freeSeats?: { personId: string; name: string }[]
  /** The name this device already goes by here, if it is already in. */
  alreadyIn?: string
}

/**
 * What an invite link shows before anyone commits to it.
 *
 * Nothing is claimed by loading the page: a link opened by a chat app fetching
 * a thumbnail, or by the wrong person by accident, must not take a seat.
 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const me = await deviceId()

  const [group] = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(eq(groups.inviteToken, token))
    .limit(1)
  if (!group) return { ok: false, message: 'That link is not valid.' }

  const seats = await db
    .select({
      localId: participants.localId,
      displayName: participants.displayName,
      claimedAt: participants.claimedAt,
      deviceId: participants.deviceId,
    })
    .from(participants)
    .where(eq(participants.groupId, group.id))

  const mine = seats.find((seat) => seat.deviceId === me)

  return {
    ok: true,
    groupName: group.name,
    alreadyIn: mine?.displayName,
    freeSeats: seats
      .filter((seat) => !seat.claimedAt)
      .map((seat) => ({ personId: seat.localId, name: seat.displayName })),
  }
}

export interface PullResult {
  ok: boolean
  message?: string
  payload?: GroupPayload
  /** The local id of the person this device is in that group. */
  meId?: string
}

/**
 * Join a group through its invite link.
 *
 * You say who you are and give your own UPI ID. Nobody else can get either
 * right: the person who made the group does not know how you spell your name
 * or which VPA you actually use, and a wrong VPA sends money to a stranger.
 *
 * Either take a name already in the group, if whoever made it listed you, or
 * arrive as somebody new. Both bind the seat to this device from then on.
 */
export async function joinGroup(
  token: string,
  who: { seatId?: string; name: string; vpa?: string },
): Promise<PullResult> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const name = who.name.trim()
  if (!name) return { ok: false, message: 'Give a name so people know who you are.' }

  const db = getDb()
  const me = await deviceId()
  const vpa = who.vpa?.trim() || null

  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.inviteToken, token))
    .limit(1)
  if (!group) return { ok: false, message: 'That link is not valid.' }

  const held = await seatOf(db, group.id, me)

  if (held) {
    // Already in. Let them correct their own name and VPA, nothing else.
    await db
      .update(participants)
      .set({ displayName: name, vpa })
      .where(eq(participants.id, held.id))
  } else if (who.seatId) {
    /**
     * Taking a name the group already listed. Conditional on the seat still
     * being free, so two people opening the same link at once cannot both
     * become Rahul: the second update matches nothing and is told so.
     */
    const taken = await db
      .update(participants)
      .set({ displayName: name, vpa, claimedAt: new Date(), deviceId: me })
      .where(
        and(
          eq(participants.groupId, group.id),
          eq(participants.localId, who.seatId),
          isNull(participants.claimedAt),
        ),
      )
      .returning({ id: participants.id })

    if (taken.length === 0) {
      return { ok: false, message: 'Somebody just took that name. Pick another.' }
    }
  } else {
    await db.insert(participants).values({
      groupId: group.id,
      localId: `p_${randomBytes(6).toString('hex')}`,
      displayName: name,
      vpa,
      claimedAt: new Date(),
      deviceId: me,
    })
  }

  const seat = await seatOf(db, group.id, me)
  const payload = await readGroup(db, group.id, me)
  if (!payload || !seat) return { ok: false, message: 'That group could not be read.' }
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

  const payload = await readGroup(db, group.id, me)
  if (!payload) return { ok: false, message: 'That group could not be read.' }
  return { ok: true, payload, meId: seat?.localId }
}

/** Read a whole group back out, in the shape the device stores it in. */
async function readGroup(
  db: Db,
  serverGroupId: string,
  device?: string,
): Promise<GroupPayload | null> {
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
      owner: device !== undefined && group.ownerDeviceId === device,
      claimed: seats.filter((s) => s.claimedAt).map((s) => s.localId),
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
 * Put a disputed payment back to the payee.
 *
 * Only the person who said they paid may do this, and only to something that
 * was actually disputed: it is the answer to "it has not arrived", not a way to
 * keep asking somebody to confirm a payment they already refused once.
 */
export async function reproposeSettlement(
  localGroupId: string,
  settlementLocalId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const me = await deviceId()
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const seat = await seatOf(db, group.id, me)
  if (!seat) return { ok: false, message: 'This device is not in that group.' }

  const [row] = await db
    .select({
      id: settlements.id,
      fromParticipantId: settlements.fromParticipantId,
      status: settlements.status,
    })
    .from(settlements)
    .where(and(eq(settlements.groupId, group.id), eq(settlements.localId, settlementLocalId)))
    .limit(1)

  if (!row) return { ok: false, message: 'That payment is not on the server.' }
  if (row.fromParticipantId !== seat.id) {
    return { ok: false, message: 'Only the person who paid can ask again.' }
  }
  if (row.status !== 'disputed') {
    return { ok: false, message: 'That payment is not disputed.' }
  }

  await db
    .update(settlements)
    .set({ status: 'proposed', confirmedAt: null })
    .where(eq(settlements.id, row.id))
  return { ok: true }
}

/**
 * Take somebody out of a shared group.
 *
 * The group's owner only. Everybody pushes the whole group, so without this
 * any member could quietly drop any other member, and the person who would
 * find out last is the one who was removed.
 */
export async function removeParticipant(
  localGroupId: string,
  personLocalId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const me = await deviceId()

  const [group] = await db
    .select({ id: groups.id, ownerDeviceId: groups.ownerDeviceId })
    .from(groups)
    .where(eq(groups.localId, localGroupId))
    .limit(1)
  if (!group) return { ok: false, message: 'That group is not shared.' }
  if (group.ownerDeviceId !== me) {
    return { ok: false, message: 'Only whoever set the group up can remove someone.' }
  }

  const seat = await seatOf(db, group.id, me)
  if (seat?.localId === personLocalId) {
    return { ok: false, message: 'You cannot remove yourself from your own group.' }
  }

  /**
   * The foreign keys from expense rows are ON DELETE RESTRICT, so somebody who
   * is on a bill cannot be deleted and Postgres says so. That is the invariant
   * doing its job: removing them would leave a balance owed to nobody.
   */
  try {
    await db
      .delete(participants)
      .where(
        and(eq(participants.groupId, group.id), eq(participants.localId, personLocalId)),
      )
    return { ok: true }
  } catch {
    return { ok: false, message: 'They are on a bill in this group, so they have to stay.' }
  }
}
