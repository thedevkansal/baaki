import 'server-only'
import { and, eq, isNull, or } from 'drizzle-orm'
import type { getDb } from '@/db/client'
import { participants, users } from '@/db/schema'
import { currentAuthUser } from './server'

type Db = ReturnType<typeof getDb>

/**
 * Who is asking, in the only two forms that exist.
 *
 * A device is something you hold; an account is something you are. Both are
 * real identities here, because signing in is optional and always will be:
 * joining a group needs no account, and a browser that has never signed in is
 * still somebody. Where both are present the account wins.
 */
export interface Caller {
  deviceId: string
  userId: string | null
}

/**
 * Give this account a row of our own.
 *
 * Supabase owns authentication; this table owns the person. Keeping our own
 * row means a participant's foreign key points at something we control, and
 * that swapping or adding an auth provider later is not a migration of every
 * seat in every group.
 */
export async function ensureUser(
  db: Db,
  auth: { id: string; email?: string | null; name?: string | null },
): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, auth.id))
    .limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(users)
    .values({
      // The same id Supabase issued, so there is one identity and not a
      // mapping table between two of them.
      id: auth.id,
      email: auth.email ?? null,
      displayName: auth.name?.trim() || auth.email?.split('@')[0] || 'You',
    })
    .onConflictDoNothing()
    .returning({ id: users.id })

  return created?.id ?? auth.id
}

/**
 * Attach every seat this device holds to the account that just signed in.
 *
 * This is what makes signing in safe to do at any moment rather than a thing
 * you had to decide before making your first group. Everything the browser
 * already had keeps working and now also belongs to a person, so a cleared
 * cache stops being the end of it.
 *
 * Seats already owned by a different account are left alone: two people
 * sharing a laptop must not hand each other their groups.
 */
export async function adoptSeats(db: Db, deviceId: string, userId: string) {
  const claimed = await db
    .update(participants)
    .set({ userId })
    .where(and(eq(participants.deviceId, deviceId), isNull(participants.userId)))
    .returning({ id: participants.id })

  return claimed.length
}

/**
 * Match a caller to a seat in a group.
 *
 * Either identity is enough. A seat claimed by this device before anybody
 * signed in still answers to the device; once adopted it answers to the
 * account from any device, which is the entire point of having accounts.
 */
export function seatMatches(caller: Caller) {
  return caller.userId
    ? or(eq(participants.userId, caller.userId), eq(participants.deviceId, caller.deviceId))!
    : eq(participants.deviceId, caller.deviceId)
}

/** The signed-in account for this request, as our own user id. */
export async function callerUserId(db: Db): Promise<string | null> {
  const auth = await currentAuthUser()
  if (!auth) return null
  return ensureUser(db, {
    id: auth.id,
    email: auth.email,
    name:
      (auth.user_metadata?.full_name as string | undefined) ??
      (auth.user_metadata?.name as string | undefined) ??
      null,
  })
}
