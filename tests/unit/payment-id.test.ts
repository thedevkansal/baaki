import { beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'

beforeAll(() => {
  process.env.PAYMENT_ID_ENCRYPTION_KEY = randomBytes(32).toString('base64')
})

const { canEncryptPaymentIds, decryptPaymentId, encryptPaymentId } = await import(
  '@/lib/auth/payment-id'
)

describe('a UPI ID at rest', () => {
  it('comes back exactly as it went in', () => {
    for (const vpa of ['rahul@okhdfcbank', '9374727362@oksbi', 'a.b-c_1@naviaxis']) {
      expect(decryptPaymentId(encryptPaymentId(vpa))).toBe(vpa)
    }
  })

  it('never produces the same ciphertext twice', () => {
    const a = encryptPaymentId('rahul@okhdfcbank')
    const b = encryptPaymentId('rahul@okhdfcbank')
    expect(a).not.toBe(b)
    expect(decryptPaymentId(a)).toBe(decryptPaymentId(b))
  })

  /**
   * The reason this is authenticated encryption and not plain AES. A VPA
   * altered by one character still looks like a VPA, and Baaki cannot see
   * payments, so nothing downstream would ever notice the money going
   * somewhere else.
   */
  it('refuses a tampered value rather than decrypting it to something else', () => {
    const stored = encryptPaymentId('rahul@okhdfcbank')
    const [iv, tag, body] = stored.split('.')
    const flipped = Buffer.from(body, 'base64url')
    flipped[0] ^= 0b0000_0001

    expect(decryptPaymentId(`${iv}.${tag}.${flipped.toString('base64url')}`)).toBeNull()
  })

  it('refuses anything that is not one of ours', () => {
    expect(decryptPaymentId('rahul@okhdfcbank')).toBeNull()
    expect(decryptPaymentId('')).toBeNull()
    expect(decryptPaymentId('a.b')).toBeNull()
  })

  it('knows whether it is configured at all', () => {
    expect(canEncryptPaymentIds()).toBe(true)
  })
})
