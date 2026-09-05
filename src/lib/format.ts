import { exponentOf, toMajorString, type Money } from './money'

export interface FormatMoneyOptions {
  /** BCP 47 locale. Defaults to en-IN so rupees group as lakh/crore. */
  locale?: string
  /** Show the currency symbol. Off when a column header already says it. */
  symbol?: boolean
  /** Always show a leading + or -, for signed balances. */
  signed?: boolean
}

/**
 * Format an exact amount for display.
 *
 * Intl.NumberFormat is given the exact decimal *string*, not a number, so the
 * value never round-trips through a float on its way to the screen.
 */
export function formatMoney(m: Money, options: FormatMoneyOptions = {}): string {
  const { locale = 'en-IN', symbol = true, signed = false } = options
  const exp = exponentOf(m.currency)

  const formatter = new Intl.NumberFormat(locale, {
    ...(symbol ? { style: 'currency' as const, currency: m.currency } : {}),
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  })

  const magnitude = m.minor < 0n ? -m.minor : m.minor
  const text = formatter.format(toMajorString({ minor: magnitude, currency: m.currency }))

  if (m.minor < 0n) return `-${text}`
  if (signed && m.minor > 0n) return `+${text}`
  return text
}

/** "you owe" / "owes you" phrasing, from the sign of a net balance. */
export function balanceTone(m: Money): 'positive' | 'negative' | 'settled' {
  if (m.minor > 0n) return 'positive'
  if (m.minor < 0n) return 'negative'
  return 'settled'
}
