'use client'

import { useEffect } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
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
 * The intermediate frames go through a float, which is fine because they are
 * never anything but pixels - the first and last frame are the exact integer
 * value, and no arithmetic here ever reaches the ledger.
 */
export function AnimatedAmount({ value, signed = false, className }: AnimatedAmountProps) {
  const reduced = useReducedMotion()
  const target = Number(value.minor)
  const minor = useMotionValue(target)

  useEffect(() => {
    if (reduced) {
      minor.set(target)
      return
    }
    const controls = animate(minor, target, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
    })
    return () => controls.stop()
  }, [minor, target, reduced])

  const text = useTransform(minor, (current) =>
    formatMoney(money(BigInt(Math.round(current)), value.currency), { signed }),
  )

  const tone = { positive: 'text-pos', negative: 'text-neg', settled: 'text-ink' }[
    balanceTone(value)
  ]

  return (
    <motion.span
      className={cn(
        'font-display text-[clamp(2.75rem,9vw,5rem)] leading-[0.92] tracking-[-0.03em] transition-colors duration-500',
        tone,
        className,
      )}
      aria-label={formatMoney(value, { signed })}
    >
      {text}
    </motion.span>
  )
}
