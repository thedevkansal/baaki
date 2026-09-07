'use server'

import { redirect } from 'next/navigation'
import { getDb, isDatabaseConfigured } from '@/db/client'
import { supabaseServer } from './server'
import { callerUserId } from './identity'
import { existingDeviceId } from './device'
import { eq } from 'drizzle-orm'
import { participants, users } from '@/db/schema'

export interface Account {
  signedIn: boolean
  name?: string
  email?: string
  /** How many seats across all groups this account holds. */
  seats?: number
}

/** Who, if anybody, is signed in on this request. */
export async function currentAccount(): Promise<Account> {
  if (!isDatabaseConfigured()) return { signedIn: false }

  const db = getDb()
  const userId = await callerUserId(db)
  if (!userId) return { signedIn: false }

  const [row] = await db
    .select({ name: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  /**
   * Groups, not seats. They are one to one today, but the number is read as
   * "how much would come back", and counting rows rather than groups is the
   * kind of thing that quietly starts lying the first time they diverge.
   */
  const seats = await db
    .selectDistinct({ groupId: participants.groupId })
    .from(participants)
    .where(eq(participants.userId, userId))

  return {
    signedIn: true,
    name: row?.name ?? undefined,
    email: row?.email ?? undefined,
    seats: seats.length,
  }
}

/**
 * Sign out, and only that.
 *
 * The device cookie is deliberately left alone. It is what a browser is when
 * nobody is signed in, and clearing it would strand every seat this device
 * holds that has not been adopted by an account yet.
 */
export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/app')
}

/** Whether this browser has ever been given a device identity. */
export async function hasDeviceIdentity(): Promise<boolean> {
  return (await existingDeviceId()) !== null
}
