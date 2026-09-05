import { toMajorString, type Money } from '../money'

/**
 * UPI deep links.
 *
 * What this buys you: the payee, the exact amount, and a note are already
 * filled in when the payment app opens. Splitwise makes you switch apps and
 * retype all three from memory.
 *
 * What it cannot buy you: confirmation. A `upi://pay` intent returns nothing
 * to the page that opened it. Knowing whether the money moved requires being
 * onboarded as a merchant with a payment aggregator, with the KYC and fees
 * that implies. So Baaki records the payer's claim and asks the payee to
 * confirm it - see `settlements.status`. Never render a link as proof of
 * payment.
 */

/** `someone@bank`. Deliberately strict: a typo here sends money to a stranger. */
const VPA = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,254}[a-zA-Z0-9])?@[a-zA-Z][a-zA-Z0-9]{1,63}$/

export function isValidVpa(value: string): boolean {
  return VPA.test(value.trim())
}

export type UpiApp = 'any' | 'gpay' | 'phonepe' | 'paytm' | 'bhim'

/** Scheme per app. `any` is the Android intent that opens the OS chooser. */
const SCHEMES: Record<UpiApp, string> = {
  any: 'upi://pay',
  gpay: 'gpay://upi/pay',
  phonepe: 'phonepe://pay',
  paytm: 'paytmmp://pay',
  bhim: 'bhim://pay',
}

export const UPI_APP_LABELS: Record<Exclude<UpiApp, 'any'>, string> = {
  gpay: 'Google Pay',
  phonepe: 'PhonePe',
  paytm: 'Paytm',
  bhim: 'BHIM',
}

export interface UpiLinkInput {
  /** Payee's virtual payment address. */
  vpa: string
  /** Payee's name, shown in the payment app for confirmation. */
  payeeName: string
  amount: Money
  /** Free text the payee sees, e.g. "Baaki · Goa Trip". */
  note?: string
  /** Our settlement id, echoed back by some apps in their history. */
  reference?: string
  app?: UpiApp
}

/** UPI note fields are short; anything longer is silently truncated by apps. */
const NOTE_LIMIT = 50
const REFERENCE_LIMIT = 35

export function buildUpiLink({
  vpa,
  payeeName,
  amount,
  note,
  reference,
  app = 'any',
}: UpiLinkInput): string {
  const address = vpa.trim()
  if (!isValidVpa(address)) {
    throw new Error(`buildUpiLink: ${JSON.stringify(vpa)} is not a valid UPI ID`)
  }
  if (amount.currency !== 'INR') {
    throw new Error(`buildUpiLink: UPI settles in INR, not ${amount.currency}`)
  }
  if (amount.minor <= 0n) {
    throw new Error('buildUpiLink: amount must be greater than zero')
  }

  const params = new URLSearchParams()
  params.set('pa', address)
  params.set('pn', payeeName.trim().slice(0, NOTE_LIMIT))
  params.set('am', toMajorString(amount))
  params.set('cu', 'INR')
  if (note) params.set('tn', sanitiseNote(note))
  if (reference)
    params.set('tr', reference.replace(/[^A-Za-z0-9]/g, '').slice(0, REFERENCE_LIMIT))

  return `${SCHEMES[app]}?${params.toString()}`
}

/** Payment apps reject notes with punctuation they do not expect. */
function sanitiseNote(note: string): string {
  return note
    .replace(/[^\w\s·.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTE_LIMIT)
}

export type UpiPlatform = 'android' | 'ios' | 'other'

export function detectPlatform(userAgent: string): UpiPlatform {
  if (/android/i.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  return 'other'
}

export interface SettleRoute {
  /** How the payer should be offered the payment on this device. */
  kind: 'intent' | 'app-picker' | 'qr'
  links: { app: UpiApp; label: string; href: string }[]
  /** Always offered as a fallback, because deep links do fail. */
  copyVpa: string
}

/**
 * How to offer a payment on a given device.
 *
 * Android registers the generic `upi://` intent, so one tap opens the OS
 * chooser with everything filled in. iOS does not register it reliably, so we
 * offer the individual apps. Desktop has no payment app at all, so the same
 * payload becomes a QR code to scan with a phone.
 */
export function settleRoute(input: UpiLinkInput, platform: UpiPlatform): SettleRoute {
  const copyVpa = input.vpa.trim()

  if (platform === 'android') {
    return {
      kind: 'intent',
      links: [
        { app: 'any', label: 'Pay with UPI', href: buildUpiLink({ ...input, app: 'any' }) },
      ],
      copyVpa,
    }
  }

  if (platform === 'ios') {
    const apps: Exclude<UpiApp, 'any'>[] = ['gpay', 'phonepe', 'paytm', 'bhim']
    return {
      kind: 'app-picker',
      links: apps.map((app) => ({
        app,
        label: UPI_APP_LABELS[app],
        href: buildUpiLink({ ...input, app }),
      })),
      copyVpa,
    }
  }

  return {
    kind: 'qr',
    links: [
      { app: 'any', label: 'Scan to pay', href: buildUpiLink({ ...input, app: 'any' }) },
    ],
    copyVpa,
  }
}
