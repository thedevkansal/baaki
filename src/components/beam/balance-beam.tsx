'use client'

import { AnimatedAmount } from '@/components/ui/animated-amount'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { add, money, zero, type CurrencyCode, type Money } from '@/lib/money'

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
 * 92 leaves a hair of breathing room so a full beam never looks clipped.
 */
const REACH = 92

/**
 * One horizontal axis, zero at the centre.
 *
 * A balance is a signed number, so this is the number line it lives on rather
 * than a list of rows. Plum to the left is what you owe, teal to the right is
 * what is owed to you, and the heavier side reaches further.
 *
 * Widths are plain inline styles with a CSS transition rather than an
 * animation library. The resting DOM already holds the correct width, so a
 * page that is not compositing shows the right balance instead of an empty
 * track; the transition only smooths the change when frames are available.
 */
export function BalanceBeam({
  segments,
  currency,
  selectedId = null,
  onSelect,
  caption,
  className,
}: BalanceBeamProps) {
  const net = segments.reduce((acc, s) => add(acc, s.amount), zero(currency))
  const owed = segments.filter((s) => s.amount.minor < 0n)
  const owing = segments.filter((s) => s.amount.minor > 0n)

  const weight = (list: BeamSegment[]) =>
    list.reduce((acc, s) => acc + absMinor(s.amount), 0n)

  const heaviest = (() => {
    const left = weight(owed)
    const right = weight(owing)
    return left > right ? left : right
  })()

  const widthOf = (m: Money) => {
    if (heaviest === 0n) return 0
    const magnitude = absMinor(m)
    if (magnitude === 0n) return 0
    // A tiny balance still has to be visible and tappable.
    return Math.max((Number(magnitude) / Number(heaviest)) * REACH, 2)
  }

  const settled = segments.every((s) => s.amount.minor === 0n)
  const defaultCaption = settled
    ? 'everyone is square'
    : net.minor < 0n
      ? 'is what you owe'
      : net.minor > 0n
        ? 'is what you are owed'
        : 'net zero, with debts still open'

  return (
    <div className={cn('w-full', className)}>
      <div className="flex flex-col items-center">
        <AnimatedAmount value={net} />
        <p className="mt-2 text-sm text-muted">{caption ?? defaultCaption}</p>
      </div>

      <div
        className="relative mt-8 h-12 w-full"
        role="group"
        aria-label={`Your balance: ${formatMoney(net)}`}
      >
        <div
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule"
          aria-hidden
        />
        <div
          className="absolute left-1/2 top-1/2 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-rule"
          aria-hidden
        />

        <div className="absolute inset-y-0 left-0 flex w-1/2 flex-row-reverse items-center gap-1 pr-1">
          {owed.map((s) => (
            <Segment
              key={s.id}
              segment={s}
              width={widthOf(s.amount)}
              side="owe"
              selected={selectedId === s.id}
              dimmed={selectedId !== null && selectedId !== s.id}
              onSelect={onSelect}
            />
          ))}
        </div>

        <div className="absolute inset-y-0 right-0 flex w-1/2 items-center gap-1 pl-1">
          {owing.map((s) => (
            <Segment
              key={s.id}
              segment={s}
              width={widthOf(s.amount)}
              side="owed"
              selected={selectedId === s.id}
              dimmed={selectedId !== null && selectedId !== s.id}
              onSelect={onSelect}
            />
          ))}
        </div>

        {settled && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            nothing outstanding
          </p>
        )}
      </div>

      <div className="mt-3 flex justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
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
  onSelect,
}: {
  segment: BeamSegment
  width: number
  side: 'owe' | 'owed'
  selected: boolean
  dimmed: boolean
  onSelect?: (id: string | null) => void
}) {
  const magnitude = money(absMinor(segment.amount), segment.amount.currency)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(selected ? null : segment.id)}
      aria-pressed={selected}
      aria-label={`${segment.label}: ${
        side === 'owe' ? 'you owe' : 'owed to you'
      } ${formatMoney(magnitude)}`}
      title={`${segment.label}: ${formatMoney(magnitude)}`}
      style={{ width: `${width}%` }}
      className={cn(
        'h-8 shrink-0 rounded-[3px] transition-all duration-500 ease-out',
        side === 'owe' ? 'bg-neg' : 'bg-pos',
        dimmed ? 'opacity-35' : 'opacity-100',
        selected && 'ring-2 ring-ink ring-offset-2 ring-offset-paper',
      )}
    />
  )
}

function absMinor(m: Money): bigint {
  return m.minor < 0n ? -m.minor : m.minor
}
