'use client'

import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'
import { balanceTone, formatMoney } from '@/lib/format'
import { money, type Money } from '@/lib/money'

export interface AnimatedAmountProps {
  value: Money
  signed?: boolean
  className?: string
}

/**
 * An amount that counts to its new value instead of cutting to it.
 *
 * This exists for one moment: settling up, when a balance runs down to zero.
 * That is the payoff of the whole product, so it gets the animation budget and
 * almost nothing else does.
 *
 * React renders the true figure; the animation only paints over it in between.
 * That ordering matters - anything driven purely by animation frames shows a
 * stale number on a page that is not compositing (a background tab, a headless
 * browser, a throttled device), and a wrong balance is worse than a static one.
 *
 * The intermediate frames go through a float, which is fine because they are
 * never anything but pixels. The value React renders is always the exact
 * integer, and no arithmetic here ever reaches the ledger.
 */
export function AnimatedAmount({ value, signed = false, className }: AnimatedAmountProps) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(Number(value.minor))

  const exact = formatMoney(value, { signed })
  const target = Number(value.minor)

  useEffect(() => {
    const node = ref.current
    const from = previous.current
    previous.current = target

    if (!node || reduced || from === target) return

    const controls = animate(from, target, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (current) => {
        node.textContent = formatMoney(money(BigInt(Math.round(current)), value.currency), {
          signed,
        })
      },
      // Land on the exact integer, never on whatever the last frame computed.
      onComplete: () => {
        node.textContent = exact
      },
    })

    return () => {
      controls.stop()
      node.textContent = exact
    }
  }, [target, exact, reduced, value.currency, signed])

  const tone = { positive: 'text-pos', negative: 'text-neg', settled: 'text-ink' }[
    balanceTone(value)
  ]

  return (
    <span
      ref={ref}
      className={cn(
        'font-display text-[clamp(2.75rem,9vw,5rem)] leading-[0.92] tracking-[-0.03em] tabular-nums transition-colors duration-500',
        tone,
        className,
      )}
    >
      {exact}
    </span>
  )
}
