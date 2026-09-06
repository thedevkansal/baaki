/**
 * Money as exact integer minor units. There are no floats in this file and no
 * float should ever hold an amount anywhere in the codebase.
 *
 * `minor` is the smallest indivisible unit of the currency: paise for INR,
 * cents for USD, whole yen for JPY.
 */

export type CurrencyCode = string

export interface Money {
  readonly minor: bigint
  readonly currency: CurrencyCode
}

/** Currencies whose minor-unit exponent is not 2. Everything else defaults to 2. */
const EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
  JOD: 3,
}

export function exponentOf(currency: CurrencyCode): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2
}

export function money(minor: bigint, currency: CurrencyCode): Money {
  return { minor, currency: currency.toUpperCase() }
}

export function zero(currency: CurrencyCode): Money {
  return money(0n, currency)
}

/**
 * Parse a human-entered amount ("1,234.50", "-12.3", "40") into exact minor
 * units. Never goes through Number, so no precision is lost at any magnitude.
 */
export function fromMajor(input: string | number, currency: CurrencyCode): Money {
  const raw = String(input)
    .trim()
    .replace(/[\s,_]/g, '')
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    throw new Error(`fromMajor: cannot parse ${JSON.stringify(String(input))} as an amount`)
  }
  const [, sign, whole = '', frac = ''] = match
  const exp = exponentOf(currency)
  if (frac.length > exp) {
    throw new Error(
      `fromMajor: ${raw} has more than ${exp} decimal place(s) for ${currency}`,
    )
  }
  const digits = (whole || '0') + frac.padEnd(exp, '0')
  const minor = BigInt(digits)
  return money(sign === '-' ? -minor : minor, currency)
}

/** Render for display. Grouping and currency symbols are the UI's job. */
export function toMajorString(m: Money): string {
  const exp = exponentOf(m.currency)
  const negative = m.minor < 0n
  const abs = (negative ? -m.minor : m.minor).toString().padStart(exp + 1, '0')
  const whole = abs.slice(0, abs.length - exp)
  const frac = exp === 0 ? '' : '.' + abs.slice(abs.length - exp)
  return `${negative ? '-' : ''}${whole}${frac}`
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`money: currency mismatch, ${a.currency} vs ${b.currency}`)
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.minor + b.minor, a.currency)
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.minor - b.minor, a.currency)
}

export function neg(a: Money): Money {
  return money(-a.minor, a.currency)
}

export function abs(a: Money): Money {
  return money(a.minor < 0n ? -a.minor : a.minor, a.currency)
}

export function isZero(a: Money): boolean {
  return a.minor === 0n
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b)
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0
}

export function sum(amounts: readonly Money[], currency: CurrencyCode): Money {
  return amounts.reduce((acc, m) => add(acc, m), zero(currency))
}

/**
 * Split `total` across `weights` so the parts sum back to exactly `total`.
 *
 * Largest-remainder method: everyone gets the floor of their exact share, then
 * the leftover minor units go to whoever was cut by the most. Ties are broken
 * by an index rotation driven by `seed`. Pass a per-expense seed so the same
 * person doesn't absorb the extra paisa on every single bill.
 *
 * Weights of zero never receive a leftover unit.
 */
export function allocate(total: Money, weights: readonly bigint[], seed = 0): Money[] {
  const n = weights.length
  if (n === 0) throw new Error('allocate: no weights given')
  if (weights.some((w) => w < 0n)) throw new Error('allocate: negative weight')

  const totalWeight = weights.reduce((a, b) => a + b, 0n)
  if (totalWeight === 0n) throw new Error('allocate: weights sum to zero')

  const negative = total.minor < 0n
  const magnitude = negative ? -total.minor : total.minor

  const parts = weights.map((w) => (magnitude * w) / totalWeight)
  const remainders = weights.map((w) => (magnitude * w) % totalWeight)
  let leftover = magnitude - parts.reduce((a, b) => a + b, 0n)

  const rotation = ((seed % n) + n) % n
  const eligible = weights
    .map((_, i) => i)
    .filter((i) => weights[i] > 0n)
    .sort((a, b) => {
      if (remainders[a] !== remainders[b]) return remainders[a] > remainders[b] ? -1 : 1
      return ((a - rotation + n) % n) - ((b - rotation + n) % n)
    })

  for (let k = 0; leftover > 0n; k += 1) {
    parts[eligible[k % eligible.length]] += 1n
    leftover -= 1n
  }

  return parts.map((p) => money(negative ? -p : p, total.currency))
}

/** Even split across `count` people, remainder rotated by `seed`. */
export function splitEqually(total: Money, count: number, seed = 0): Money[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('splitEqually: count must be a positive integer')
  }
  return allocate(
    total,
    Array.from({ length: count }, () => 1n),
    seed,
  )
}
