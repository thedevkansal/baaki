import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * A UPI ID, encrypted at rest.
 *
 * It is the one field here that moves money if it leaks or, worse, if it is
 * altered: a VPA changed by one character sends every payment to a stranger,
 * and Baaki cannot see payments, so nothing would notice. AES-GCM is chosen
 * over plain AES for exactly that second reason. It is authenticated, so a
 * tampered ciphertext fails to decrypt rather than quietly producing a
 * different, valid-looking VPA.
 *
 * The key never leaves the server. Anything the browser is told about somebody
 * else's UPI ID is the decrypted value, given only to people in their group.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function key(): Buffer | null {
  const raw = process.env.PAYMENT_ID_ENCRYPTION_KEY
  if (!raw) return null
  const parsed = Buffer.from(raw, 'base64')
  if (parsed.length !== 32) {
    throw new Error(
      'PAYMENT_ID_ENCRYPTION_KEY must be 32 bytes of base64. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }
  return parsed
}

/** Whether payment IDs can be stored encrypted at all. */
export const canEncryptPaymentIds = () => key() !== null

/**
 * `iv.tag.ciphertext`, all base64url.
 *
 * Self describing so the stored value carries everything decryption needs, and
 * so a row can be told apart from a plain text one left over from before this
 * existed without a schema flag to keep in step.
 */
export function encryptPaymentId(value: string): string {
  const secret = key()
  if (!secret) throw new Error('PAYMENT_ID_ENCRYPTION_KEY is not set.')

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, secret, iv)
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, body].map((part) => part.toString('base64url')).join('.')
}

/**
 * Returns null rather than throwing on anything it cannot verify.
 *
 * A VPA that fails its authentication tag is not a VPA to pay: the screen shows
 * "no UPI ID" and offers to ask them for it, which is the same safe path as
 * never having had one. Guessing is the one thing that must not happen.
 */
export function decryptPaymentId(stored: string): string | null {
  const secret = key()
  if (!secret) return null

  const parts = stored.split('.')
  if (parts.length !== 3) return null

  try {
    const [iv, tag, body] = parts.map((part) => Buffer.from(part, 'base64url'))
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null

    const decipher = createDecipheriv(ALGORITHM, secret, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
