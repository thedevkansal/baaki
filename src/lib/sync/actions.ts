'use server'

import { randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb, isDatabaseConfigured } from '@/db/client'
import { deviceId } from '@/lib/auth/device'
import { canEncryptPaymentIds, decryptPaymentId, encryptPaymentId } from '@/lib/auth/payment-id'
import {
  accountVpa,
  callerUserId,
  rememberAccountVpa,
  seatMatches,
  type Caller,
} from '@/lib/auth/identity'
import {
  expensePayers,
  expenseShares,
  expenses,
  groups,
  nudges,
  participants,
  settlements,
} from '@/db/schema'
import type { GroupPayload, JoinLink, Nudge } from './payload'

type Db = ReturnType<typeof getDb>

/**
 * Who is asking, in both forms at once.
 *
 * Resolved per request rather than per call site, so every check below asks the
 * same question. A seat answers to the device that claimed it and, once it has
 * been adopted, to the account that owns it from any device.
 */
/**
 * A UPI ID on its way into the database.
 *
 * Encryption is not optional in the sense of "store it plain if the key is
 * missing": a deployment without a key stores no UPI IDs at all, because
 * silently downgrading to plaintext is how a security property gets lost
 * without anybody deciding to lose it.
 */
function sealVpa(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (!canEncryptPaymentIds()) return null
  return encryptPaymentId(trimmed)
}

async function caller(db: Db): Promise<Caller> {
  return { deviceId: await deviceId(), userId: await callerUserId(db) }
}

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
  const who = await caller(db)
  const me = who.deviceId
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
          set: {
            name: group.name,
            currency: group.currency,
            simplify: group.simplify,
            // Groups made before this column existed have no owner. The first
            // device to push after that adopts it; a real owner is never moved.
            ownerDeviceId: sql`coalesce(${groups.ownerDeviceId}, excluded.owner_device_id)`,
          },
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
            vpaEncrypted: sealVpa(person.vpa),
            // The sharing device takes its own seat on the spot; everybody
            // else arrives through the group's invite link.
            ...(person.id === meLocalId
              ? {
                  claimedAt: new Date(),
                  deviceId: me,
                  userId: who.userId,
                  role: 'admin' as const,
                }
              : {}),
          })
          .onConflictDoNothing()
      }

      /**
       * The owner may still fix a name nobody has claimed: "p1" was a
       * placeholder for a person who has not turned up, and correcting it to
       * "Priya" before she does is the point of listing people at all.
       */
      const [seat] = await tx
        .select({ role: participants.role })
        .from(participants)
        .where(and(eq(participants.groupId, serverGroupId), seatMatches(who)))
        .limit(1)

      if (seat?.role === 'admin') {
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
          userId: participants.userId,
        })
        .from(participants)
        .where(eq(participants.groupId, serverGroupId))

      const seatByLocal = new Map(rows.map((r) => [r.localId, r.id]))

      /**
       * Your own name and UPI ID, which are yours alone to set.
       *
       * Keyed on the seat this device actually holds, not on the one the client
       * says is its own. When those disagreed the update matched no rows, the
       * server kept whatever it had, and the next pull put it back: a rename
       * that saved locally and then silently reverted seconds later.
       */
      const mySeat = rows.find(
        (row) => row.deviceId === me || (who.userId && row.userId === who.userId),
      )
      const mine = mySeat && payload.people.find((person) => person.id === mySeat.localId)
      if (mySeat && mine) {
        await tx
          .update(participants)
          .set({ displayName: mine.name, vpaEncrypted: sealVpa(mine.vpa) })
          .where(eq(participants.id, mySeat.id))
      }


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
  /** This account's UPI ID from another group, so it can be prefilled. */
  knownVpa?: string
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
  const who = await caller(db)
  const me = who.deviceId

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

  /** Offered back so a signed-in person is not asked for it a second time. */
  const known = who.userId ? await accountVpa(db, who.userId) : null

  return {
    ok: true,
    groupName: group.name,
    alreadyIn: mine?.displayName,
    knownVpa: (known && decryptPaymentId(known)) || undefined,
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
  if (!who.vpa?.trim()) {
    return { ok: false, message: 'A UPI ID is how people pay you back. Add yours.' }
  }

  const db = getDb()
  const me = await deviceId()
  const vpa = who.vpa?.trim() || null

  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.inviteToken, token))
    .limit(1)
  if (!group) return { ok: false, message: 'That link is not valid.' }

  const mine = await caller(db)
  const held = await seatOf(db, group.id, mine)

  if (held) {
    // Already in. Let them correct their own name and VPA, nothing else.
    await db
      .update(participants)
      .set({ displayName: name, vpaEncrypted: sealVpa(vpa) })
      .where(eq(participants.id, held.id))
  } else if (who.seatId) {
    /**
     * Taking a name the group already listed. Conditional on the seat still
     * being free, so two people opening the same link at once cannot both
     * become Rahul: the second update matches nothing and is told so.
     */
    const taken = await db
      .update(participants)
      .set({
        displayName: name,
        vpaEncrypted: sealVpa(vpa),
        claimedAt: new Date(),
        deviceId: me,
        // Recorded now rather than at the next sign-in, so a seat taken while
        // already signed in belongs to the account from the moment it exists.
        userId: mine.userId,
      })
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
      vpaEncrypted: sealVpa(vpa),
      claimedAt: new Date(),
      deviceId: me,
      userId: mine.userId,
    })
  }

  /**
   * Kept against the account as well as the seat, so the next group does not
   * ask again. Someone signed in gives their UPI ID once, ever.
   */
  const sealed = sealVpa(vpa)
  if (mine.userId && sealed) await rememberAccountVpa(db, mine.userId, sealed)

  const seat = await seatOf(db, group.id, mine)
  const payload = await readGroup(db, group.id, mine)
  if (!payload || !seat) return { ok: false, message: 'That group could not be read.' }
  return { ok: true, payload, meId: seat.localId }
}

/** Pull the current server copy of a group this device already belongs to. */
export async function pullGroup(localGroupId: string): Promise<PullResult> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const who = await caller(db)

  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.localId, localGroupId))
    .limit(1)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const [seat] = await db
    .select({ localId: participants.localId })
    .from(participants)
    .where(and(eq(participants.groupId, group.id), seatMatches(who)))
    .limit(1)

  const payload = await readGroup(db, group.id, who)
  if (!payload) return { ok: false, message: 'That group could not be read.' }
  return { ok: true, payload, meId: seat?.localId }
}

/** Read a whole group back out, in the shape the device stores it in. */
async function readGroup(
  db: Db,
  serverGroupId: string,
  who?: Caller,
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

  const isMine = (seat: { deviceId: string | null; userId: string | null }) =>
    Boolean(who) &&
    (seat.deviceId === who!.deviceId ||
      (who!.userId !== null && seat.userId === who!.userId))

  const asks: Nudge[] = []
  if (who) {
    const mySeat = seats.find(isMine)
    if (mySeat) {
      const rows = await db
        .select({
          id: nudges.id,
          kind: nudges.kind,
          fromParticipantId: nudges.fromParticipantId,
        })
        .from(nudges)
        .where(eq(nudges.toParticipantId, mySeat.id))

      for (const row of rows) {
        /**
         * A nudge resolves by being answered, not by being dismissed. Asking
         * somebody to add a UPI ID stops being a thing to do the moment they
         * have one, so it is filtered here rather than deleted on a write that
         * might never happen.
         */
        if (row.kind === 'add-upi' && mySeat.vpaEncrypted) continue
        asks.push({
          id: row.id,
          groupId: group.localId,
          groupName: group.name,
          fromName:
            seats.find((s) => s.id === row.fromParticipantId)?.displayName ?? 'Somebody',
          kind: row.kind,
        })
      }
    }
  }

  return {
    nudges: asks,
    group: {
      id: group.localId,
      name: group.name,
      currency: group.currency,
      simplify: group.simplify,
      memberIds: seats.map((s) => s.localId),
      createdAt: group.createdAt.toISOString(),
      owner: seats.some((s) => isMine(s) && s.role === 'admin'),
      claimed: seats.filter((s) => s.claimedAt).map((s) => s.localId),
      admins: seats.filter((s) => s.role === 'admin').map((s) => s.localId),
    },
    people: seats.map((seat) => {
      /**
       * A UPI ID that fails its authentication tag is not a UPI ID to pay: the
       * settle screen then says there is none and offers to ask for it, which
       * is the same safe path as never having had one.
       */
      const vpa = seat.vpaEncrypted ? decryptPaymentId(seat.vpaEncrypted) : null
      return { id: seat.localId, name: seat.displayName, ...(vpa ? { vpa } : {}) }
    }),
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
async function seatOf(db: Db, serverGroupId: string, who: Caller) {
  const [seat] = await db
    .select({ id: participants.id, localId: participants.localId })
    .from(participants)
    .where(and(eq(participants.groupId, serverGroupId), seatMatches(who)))
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
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const seat = await seatOf(db, group.id, await caller(db))
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
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const seat = await seatOf(db, group.id, await caller(db))
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

  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const seat = await adminSeat(db, group.id, await caller(db))
  if (!seat) return { ok: false, message: 'Only an admin of this group can remove someone.' }
  if (seat.localId === personLocalId) {
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

/** This device's seat in a group, but only if it is an admin one. */
async function adminSeat(db: Db, serverGroupId: string, who: Caller) {
  const [seat] = await db
    .select({ id: participants.id, localId: participants.localId })
    .from(participants)
    .where(
      and(
        eq(participants.groupId, serverGroupId),
        seatMatches(who),
        eq(participants.role, 'admin'),
      ),
    )
    .limit(1)
  return seat ?? null
}

/**
 * Hand somebody else the keys.
 *
 * An admin can make another member an admin, and cannot demote anybody:
 * a group whose only admin lost their phone should be rescuable, and a group
 * where two admins can strip each other should not exist.
 */
export async function makeAdmin(
  localGroupId: string,
  personLocalId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const seat = await adminSeat(db, group.id, await caller(db))
  if (!seat) return { ok: false, message: 'Only an admin can make somebody else one.' }

  const changed = await db
    .update(participants)
    .set({ role: 'admin' })
    .where(and(eq(participants.groupId, group.id), eq(participants.localId, personLocalId)))
    .returning({ id: participants.id })

  if (changed.length === 0) return { ok: false, message: 'They are not in this group.' }
  return { ok: true }
}

/**
 * Ask somebody in the group to add their UPI ID.
 *
 * The alternative was a sentence telling you to go and ask them yourself,
 * through some other app, which is the friction this product exists to remove.
 * Asking twice is the same ask: the unique index makes a second press a no-op
 * rather than a second thing in their list.
 */
export async function sendNudge(
  localGroupId: string,
  toPersonLocalId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: 'No database is configured.' }

  const db = getDb()
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: false, message: 'That group is not shared.' }

  const from = await seatOf(db, group.id, await caller(db))
  if (!from) return { ok: false, message: 'This device is not in that group.' }

  const [to] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(eq(participants.groupId, group.id), eq(participants.localId, toPersonLocalId)),
    )
    .limit(1)
  if (!to) return { ok: false, message: 'They are not in this group.' }

  await db
    .insert(nudges)
    .values({
      groupId: group.id,
      fromParticipantId: from.id,
      toParticipantId: to.id,
      kind: 'add-upi',
    })
    .onConflictDoNothing()

  return { ok: true }
}

/**
 * Leave a shared group, or delete it if it is yours to delete.
 *
 * Deleting a group on one device used to be silent: the rows stayed in
 * Postgres with the seat still attached, so an account went on collecting
 * groups its owner could no longer see. An admin deleting takes the group with
 * them, since they are the person who made it; anybody else is only leaving,
 * and leaving must not take everyone else's ledger with it.
 */
export async function leaveGroup(
  localGroupId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isDatabaseConfigured()) return { ok: false }

  const db = getDb()
  const who = await caller(db)
  const group = await serverGroup(db, localGroupId)
  if (!group) return { ok: true }

  const admin = await adminSeat(db, group.id, who)
  if (admin) {
    await db.delete(groups).where(eq(groups.id, group.id))
    return { ok: true }
  }

  const seat = await seatOf(db, group.id, who)
  if (!seat) return { ok: true }

  /**
   * A seat that is on a bill cannot be deleted, and should not be: their share
   * would be owed by nobody. Unbinding it instead means the ledger still adds
   * up and the person simply stops being on this device.
   */
  try {
    await db.delete(participants).where(eq(participants.id, seat.id))
  } catch {
    await db
      .update(participants)
      .set({ deviceId: null, userId: null, claimedAt: null })
      .where(eq(participants.id, seat.id))
  }
  return { ok: true }
}
