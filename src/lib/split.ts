import {
  allocate,
  exponentOf,
  fromMajor,
  money,
  sub,
  sum,
  toMajorString,
  zero,
  type Money,
} from './money'

/**
 * The ways a bill can be divided.
 *
 * All five are free here. Splitwise gates unequal splits and default split
 * settings behind Pro, which is most of why people leave.
 */
export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares' | 'adjustment'

export const SPLIT_MODES: { value: SplitMode; label: string; hint: string }[] = [
  { value: 'equal', label: 'Equally', hint: 'Everyone selected pays the same' },
  { value: 'exact', label: 'Exact amounts', hint: 'Type what each person owes' },
  { value: 'percent', label: 'Percentages', hint: 'Must add up to 100%' },
  { value: 'shares', label: 'Shares', hint: 'A couple counts as two, a guest as one' },
  { value: 'adjustment', label: 'Plus or minus', hint: 'Split evenly, then adjust' },
]

export interface SplitParticipant {
  ref: string
  /** Included in the split at all. Unselected people owe nothing. */
  selected: boolean
  /**
   * Meaning depends on the mode: an amount for `exact` and `adjustment`, a
   * percentage for `percent`, a whole number of shares for `shares`, and
   * nothing at all for `equal`.
   */
  value?: string
}

export interface SplitResult {
  shares: { ref: string; amount: Money }[]
  /** Human-readable reason the split is not valid yet, if it isn't. */
  error?: string
}

/**
 * Turn what someone typed into exact per-person amounts.
 *
 * Every branch ends in `allocate` or an explicit sum check, so the shares add
 * back to the total to the paisa or the caller gets an error - never a silently
 * rounded bill.
 */
export function buildShares(
  total: Money,
  mode: SplitMode,
  participants: SplitParticipant[],
  seed = 0,
): SplitResult {
  const chosen = participants.filter((p) => p.selected)
  const empty = participants.map((p) => ({ ref: p.ref, amount: zero(total.currency) }))

  if (chosen.length === 0) {
    return { shares: empty, error: 'Pick at least one person to split between.' }
  }

  const spread = (weights: bigint[]): SplitResult => {
    const parts = allocate(total, weights, seed)
    const byRef = new Map(chosen.map((p, i) => [p.ref, parts[i]]))
    return {
      shares: participants.map((p) => ({
        ref: p.ref,
        amount: byRef.get(p.ref) ?? zero(total.currency),
      })),
    }
  }

  switch (mode) {
    case 'equal':
      return spread(chosen.map(() => 1n))

    case 'shares': {
      const weights: bigint[] = []
      for (const p of chosen) {
        const raw = (p.value ?? '1').trim()
        if (!/^\d+$/.test(raw)) {
          return { shares: empty, error: 'Shares must be whole numbers.' }
        }
        weights.push(BigInt(raw))
      }
      if (weights.every((w) => w === 0n)) {
        return { shares: empty, error: 'Give at least one person a share.' }
      }
      return spread(weights)
    }

    case 'percent': {
      const weights: bigint[] = []
      for (const p of chosen) {
        try {
          // Percentages carry two decimals, so 33.33% becomes a weight of 3333.
          weights.push(fromMajor(p.value ?? '0', 'XXX').minor)
        } catch {
          return { shares: empty, error: 'Percentages must be numbers.' }
        }
      }
      const totalPercent = weights.reduce((a, b) => a + b, 0n)
      if (totalPercent !== 10_000n) {
        return {
          shares: empty,
          error: `Percentages add up to ${toMajorString(money(totalPercent, 'XXX'))}%, not 100%.`,
        }
      }
      return spread(weights)
    }

    case 'exact': {
      const amounts: Money[] = []
      for (const p of chosen) {
        try {
          amounts.push(fromMajor(p.value ?? '0', total.currency))
        } catch {
          return { shares: empty, error: 'Amounts must be numbers.' }
        }
      }
      if (amounts.some((a) => a.minor < 0n)) {
        return { shares: empty, error: 'Amounts cannot be negative.' }
      }
      const entered = sum(amounts, total.currency)
      if (entered.minor !== total.minor) {
        const gap = sub(total, entered)
        const over = gap.minor < 0n
        return {
          shares: empty,
          error: `${toMajorString(money(over ? -gap.minor : gap.minor, total.currency))} ${
            over ? 'over' : 'left to assign'
          }.`,
        }
      }
      const byRef = new Map(chosen.map((p, i) => [p.ref, amounts[i]]))
      return {
        shares: participants.map((p) => ({
          ref: p.ref,
          amount: byRef.get(p.ref) ?? zero(total.currency),
        })),
      }
    }

    case 'adjustment': {
      const extras: Money[] = []
      for (const p of chosen) {
        try {
          extras.push(fromMajor(p.value?.trim() || '0', total.currency))
        } catch {
          return { shares: empty, error: 'Adjustments must be numbers.' }
        }
      }
      // Take the adjustments off the top, split what is left evenly, then hand
      // each person their adjustment back.
      const base = sub(total, sum(extras, total.currency))
      if (base.minor < 0n) {
        return { shares: empty, error: 'The adjustments add up to more than the bill.' }
      }
      const evenly = allocate(
        base,
        chosen.map(() => 1n),
        seed,
      )
      const byRef = new Map(
        chosen.map((p, i) => [
          p.ref,
          money(evenly[i].minor + extras[i].minor, total.currency),
        ]),
      )
      if ([...byRef.values()].some((m) => m.minor < 0n)) {
        return { shares: empty, error: 'That leaves someone owing a negative amount.' }
      }
      return {
        shares: participants.map((p) => ({
          ref: p.ref,
          amount: byRef.get(p.ref) ?? zero(total.currency),
        })),
      }
    }
  }
}

/**
 * Evaluate what someone typed into the amount field.
 *
 * "Calculator when entering bills" is the second most requested feature on
 * Splitwise's own board with 955 votes, and it is still not built. People type
 * `450+120*2` because that is what the receipt looks like.
 *
 * Deliberately not eval: only digits, the four operators, brackets and a
 * decimal point get through, and the result is rounded to the currency's minor
 * unit at the very end.
 */
export function evaluateAmount(input: string, currency: string): Money | null {
  const source = input.trim().replace(/[\s,]/g, '')
  if (source === '') return null
  if (!/^[0-9+\-*/().]+$/.test(source)) return null

  let position = 0

  const peek = () => source[position]
  const eat = (char: string) => {
    if (source[position] === char) {
      position += 1
      return true
    }
    return false
  }

  function expression(): number {
    let value = term()
    for (;;) {
      if (eat('+')) value += term()
      else if (eat('-')) value -= term()
      else return value
    }
  }

  function term(): number {
    let value = factor()
    for (;;) {
      if (eat('*')) value *= factor()
      else if (eat('/')) {
        const divisor = factor()
        if (divisor === 0) return NaN
        value /= divisor
      } else return value
    }
  }

  function factor(): number {
    if (eat('+')) return factor()
    if (eat('-')) return -factor()
    if (eat('(')) {
      const value = expression()
      if (!eat(')')) return NaN
      return value
    }
    const start = position
    while (position < source.length && /[0-9.]/.test(peek())) position += 1
    if (position === start) return NaN
    const chunk = source.slice(start, position)
    if ((chunk.match(/\./g) ?? []).length > 1) return NaN
    return Number(chunk)
  }

  const result = expression()
  if (position !== source.length || !Number.isFinite(result) || result < 0) return null

  // The arithmetic runs in floating point, but the answer is snapped to whole
  // minor units immediately and everything downstream stays exact.
  const scaled = Math.round(result * 10 ** exponentOf(currency))
  if (!Number.isSafeInteger(scaled)) return null
  return money(BigInt(scaled), currency)
}
