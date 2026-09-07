import 'server-only'
import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'

export const DEVICE_COOKIE = 'baaki-device'

/**
 * Who this browser is, before anybody signs in.
 *
 * An opaque random id the browser keeps and the server compares. It is set the
 * first time a device shares or joins, is never derived from anything about the
 * person, and means nothing outside this app.
 *
 * Accounts do not replace it. Signing in stays optional, so an unsigned browser
 * is still somebody, and the seats it already holds keep answering to it even
 * after they are adopted by an account.
 */
export async function deviceId(): Promise<string> {
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

/** The device id if this browser already has one, without minting a new one. */
export async function existingDeviceId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(DEVICE_COOKIE)?.value ?? null
}
