import { exponentOf, money, type CurrencyCode, type Money } from './money'

/**
 * Convert an amount at a rate captured when the expense was entered.
 *
 * The rate is a decimal string ("0.0106", "83.42") rather than a float, and the
 * whole conversion runs in bigint, so the stored result is exact and stable.
 * Re-reading an old expense next year gives the same number it gave on the day
 * - which is the entire point of snapshotting a rate instead of looking one up.
 */
export function convertMoney(amount: Money, to: CurrencyCode, rate: string): Money {
  const target = to.toUpperCase()
  if (amount.currency === target) return amount

  const cleaned = rate.trim()
  const match = /^(\d*)(?:\.(\d*))?$/.exec(cleaned)
  if (!match || cleaned === '' || cleaned === '.') {
    throw new Error(`convertMoney: ${JSON.stringify(rate)} is not a rate`)
  }
  const [, whole = '', fraction = ''] = match
  const rateMinor = BigInt((whole || '0') + fraction)
  if (rateMinor === 0n) throw new Error('convertMoney: rate must be greater than zero')

  const rateScale = 10n ** BigInt(fraction.length)
  const fromScale = 10n ** BigInt(exponentOf(amount.currency))
  const toScale = 10n ** BigInt(exponentOf(target))

  // value = minor / fromScale * rate, re-expressed in the target's minor units.
  const numerator = amount.minor * rateMinor * toScale
  const denominator = rateScale * fromScale

  return money(divideRounded(numerator, denominator), target)
}

/** Round half away from zero, so converting 0.5 up and -0.5 down stays symmetric. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n
  const magnitude = negative ? -numerator : numerator
  const quotient = magnitude / denominator
  const remainder = magnitude % denominator
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}

/**
 * Indicative rates, so the app is usable before any rate feed is wired up.
 * They are stamped onto an expense at entry and never re-applied afterwards,
 * and the UI lets you overwrite the number with the rate you actually got.
 */
export const FALLBACK_RATES_TO_INR: Record<string, string> = {
  INR: '1',
  USD: '88',
  EUR: '95',
  GBP: '111',
  AED: '24',
  SGD: '65',
  JPY: '0.56',
  AUD: '57',
  CAD: '63',
  THB: '2.5',
  NPR: '0.63',
  LKR: '0.29',
}

export const SUPPORTED_CURRENCIES = Object.keys(FALLBACK_RATES_TO_INR)
