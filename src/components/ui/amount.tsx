import { cn } from '@/lib/cn'
import { balanceTone, formatMoney } from '@/lib/format'
import type { Money } from '@/lib/money'

type AmountSize = 'display' | 'title' | 'body' | 'small'

const SIZES: Record<AmountSize, string> = {
  display: 'font-display text-[clamp(2.75rem,9vw,5rem)] leading-[0.92] tracking-[-0.03em]',
  title: 'font-display text-3xl leading-none tracking-[-0.02em]',
  body: 'font-sans text-base',
  small: 'font-sans text-sm',
}

export interface AmountProps {
  value: Money
  size?: AmountSize
  /** Colour by sign. Off for neutral figures like an expense total. */
  tone?: 'signed' | 'ink' | 'muted'
  /** Force a leading + on positive values. */
  signed?: boolean
  symbol?: boolean
  className?: string
}

/**
 * The one place an amount becomes visible text.
 *
 * Colour here is meaning, not decoration: teal is money coming back to you,
 * plum is money you owe. A settled balance is ink, because zero has no side.
 */
export function Amount({
  value,
  size = 'body',
  tone = 'ink',
  signed = false,
  symbol = true,
  className,
}: AmountProps) {
  const text = formatMoney(value, { signed, symbol })
  const toneClass =
    tone === 'muted'
      ? 'text-muted'
      : tone === 'ink'
        ? 'text-ink'
        : { positive: 'text-pos', negative: 'text-neg', settled: 'text-ink' }[
            balanceTone(value)
          ]

  return <span className={cn(SIZES[size], toneClass, className)}>{text}</span>
}
