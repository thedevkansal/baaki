'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'
import { balanceTone, formatMoney } from '@/lib/format'
import { money, type Money } from '@/lib/money'

export interface AnimatedAmountProps {
  value: Money
  signed?: boolean
  className?: string
}

const DURATION = 900
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * An amount that counts to its new value instead of cutting to it.
 *
 * This exists for one moment: settling up, when a balance runs down to zero.
 * That is the payoff of the whole product, so it gets the animation budget and
 * almost nothing else does.
 *
 * React renders the true figure. The count is driven by requestAnimationFrame
 * directly, and the first character is only overwritten inside a frame
 * callback, so a page that is not being drawn keeps the correct balance rather
 * than whatever an animation left behind. An animation library cannot give
 * that guarantee here: they write their opening keyframe synchronously, which
 * paints the previous figure over the current one and strands it there if no
 * frame ever follows. A wrong balance is worse than a still one.
 *
 * The interpolated frames go through a float, which is fine because they are
 * never anything but pixels. The first and last thing shown is always the
 * exact integer, and no arithmetic here reaches the ledger.
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

    let frame = 0
    let startedAt = 0

    const tick = (now: number) => {
      if (!startedAt) startedAt = now
      const progress = Math.min((now - startedAt) / DURATION, 1)
      if (progress < 1) {
        const current = from + (target - from) * easeOut(progress)
        node.textContent = formatMoney(money(BigInt(Math.round(current)), value.currency), {
          signed,
        })
        frame = requestAnimationFrame(tick)
      } else {
        // Land on the exact integer, never on an interpolated frame.
        node.textContent = exact
      }
    }

    frame = requestAnimationFrame(tick)

    /**
     * Frames can stop part way through: the tab goes to the background, the
     * device throttles, the page stops being drawn. Without this the figure
     * freezes on whichever interpolated value it had reached, which is a
     * wrong balance left on screen. A timer is not tied to compositing, so
     * it lands the exact value no matter what happened to the animation.
     */
    const settle = () => {
      node.textContent = exact
    }
    const failsafe = setTimeout(settle, DURATION + 100)
    document.addEventListener('visibilitychange', settle)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(failsafe)
      document.removeEventListener('visibilitychange', settle)
      settle()
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
