'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { cn } from '@/lib/cn'
import { add, money, zero, type CurrencyCode, type Money } from '@/lib/money'
import { formatMoney } from '@/lib/format'

export interface BeamSegment {
  id: string
  label: string
  /** Signed: negative means you owe, positive means you are owed. */
  amount: Money
}

export interface BalanceBeamProps {
  segments: BeamSegment[]
  currency: CurrencyCode
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  /** Caption under the net figure. Defaults to a plain reading of the sign. */
  caption?: string
  className?: string
}

/**
 * How far the heavier side reaches, as a percentage of its half of the track.
 * 92 leaves a hair of breathing room at the ends so a full beam never looks
 * clipped.
 */
const REACH = 92

const spring = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 30,
  mass: 0.9,
}

/**
 * One horizontal axis, zero at the centre.
 *
 * A balance is a signed number, so the home screen is the number line it lives
 * on rather than a list of rows. Plum to the left is what you owe, teal to the
 * right is what is owed to you, and the side that is heavier reaches further.
 */
export function BalanceBeam({
  segments,
  currency,
  selectedId = null,
  onSelect,
  caption,
  className,
}: BalanceBeamProps) {
  const reduced = useReducedMotion()

  const net = segments.reduce((acc, s) => add(acc, s.amount), zero(currency))
  const owed = segments.filter((s) => s.amount.minor < 0n)
  const owing = segments.filter((s) => s.amount.minor > 0n)

  const weight = (list: BeamSegment[]) =>
    list.reduce(
      (acc, s) => acc + (s.amount.minor < 0n ? -s.amount.minor : s.amount.minor),
      0n,
    )

  const heaviest = (() => {
    const left = weight(owed)
    const right = weight(owing)
    return left > right ? left : right
  })()

  const widthOf = (m: Money) => {
    if (heaviest === 0n) return 0
    const magnitude = m.minor < 0n ? -m.minor : m.minor
    if (magnitude === 0n) return 0
    // A tiny balance still has to be visible and tappable.
    return Math.max((Number(magnitude) / Number(heaviest)) * REACH, 1.5)
  }

  const settled = net.minor === 0n && segments.every((s) => s.amount.minor === 0n)
  const defaultCaption = settled
    ? 'Everyone is square'
    : net.minor < 0n
      ? 'you owe, across all groups'
      : net.minor > 0n
        ? 'owed to you, across all groups'
        : 'net zero, with debts still open'

  return (
    <div className={cn('w-full', className)}>
      <div className="flex flex-col items-center">
        <AnimatedAmount value={net} />
        <p className="mt-2 text-sm text-muted">{caption ?? defaultCaption}</p>
      </div>

      <div
        className="relative mt-10 h-14 w-full"
        role="group"
        aria-label={`Balance across your groups: ${formatMoney(net)}`}
      >
        {/* The axis itself, and the tick that marks zero. */}
        <div
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule"
          aria-hidden
        />
        <div
          className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-rule"
          aria-hidden
        />

        <div className="absolute inset-y-0 left-0 flex w-1/2 flex-row-reverse items-center justify-start gap-1 pr-1">
          <AnimatePresence initial={false}>
            {owed.map((s) => (
              <Segment
                key={s.id}
                segment={s}
                width={widthOf(s.amount)}
                side="owe"
                selected={selectedId === s.id}
                dimmed={selectedId !== null && selectedId !== s.id}
                reduced={Boolean(reduced)}
                onSelect={onSelect}
              />
            ))}
          </AnimatePresence>
        </div>

        <div className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-start gap-1 pl-1">
          <AnimatePresence initial={false}>
            {owing.map((s) => (
              <Segment
                key={s.id}
                segment={s}
                width={widthOf(s.amount)}
                side="owed"
                selected={selectedId === s.id}
                dimmed={selectedId !== null && selectedId !== s.id}
                reduced={Boolean(reduced)}
                onSelect={onSelect}
              />
            ))}
          </AnimatePresence>
        </div>

        {settled && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            Nothing outstanding
          </p>
        )}
      </div>

      <div className="mt-3 flex justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted">
        <span>you owe</span>
        <span>owed to you</span>
      </div>
    </div>
  )
}

function Segment({
  segment,
  width,
  side,
  selected,
  dimmed,
  reduced,
  onSelect,
}: {
  segment: BeamSegment
  width: number
  side: 'owe' | 'owed'
  selected: boolean
  dimmed: boolean
  reduced: boolean
  onSelect?: (id: string | null) => void
}) {
  const magnitude = money(
    segment.amount.minor < 0n ? -segment.amount.minor : segment.amount.minor,
    segment.amount.currency,
  )

  return (
    <motion.button
      type="button"
      transition={reduced ? { duration: 0 } : spring}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: `${width}%`, opacity: dimmed ? 0.35 : 1 }}
      // Settling retracts the segment toward zero rather than blinking it out.
      exit={{ width: 0, opacity: 0, marginInline: 0 }}
      onClick={() => onSelect?.(selected ? null : segment.id)}
      aria-pressed={selected}
      aria-label={`${segment.label}: ${
        side === 'owe' ? 'you owe' : 'owed to you'
      } ${formatMoney(magnitude)}`}
      className={cn(
        'h-9 shrink-0 rounded-[3px] transition-colors',
        side === 'owe' ? 'bg-neg' : 'bg-pos',
        selected && 'ring-2 ring-ink ring-offset-2 ring-offset-paper',
      )}
    />
  )
}
