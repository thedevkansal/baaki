'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { netBalances, pairwiseDebts } from '@/lib/ledger/balances'
import type { ExpenseEntry, ParticipantRef } from '@/lib/ledger/types'
import { Ruler } from '@/components/ui/ruler'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { fromMajor, money, splitEqually, zero, type Money } from '@/lib/money'

const INR = 'INR'

const YOU = 'user:you' as ParticipantRef
const PRIYA = 'user:priya' as ParticipantRef
const RAHUL = 'user:rahul' as ParticipantRef
const AMAN = 'user:aman' as ParticipantRef
const GROUP = [YOU, PRIYA, RAHUL, AMAN]

const NAMES: Record<string, string> = {
  [PRIYA]: 'Priya',
  [RAHUL]: 'Rahul',
  [AMAN]: 'Aman',
}

/** The three bills a trip actually produces, in the order they happen. */
const BILLS = [
  { id: 'hotel', label: 'Beach house', total: '12400', payer: PRIYA },
  { id: 'dinner', label: 'Dinner', total: '3200', payer: YOU },
  { id: 'cab', label: 'Airport cab', total: '890', payer: RAHUL },
] as const

/**
 * The hero answers its own headline.
 *
 * Every number below is computed by the same ledger the product runs on -
 * `netBalances` and `pairwiseDebts`, imported directly. A marketing page that
 * fakes its own maths is a page that will eventually disagree with the app.
 */
export function Hero() {
  const reduced = useReducedMotion()
  // The first bill is already on the table. An empty hero opening on a big
  // zero wastes the one frame everybody sees.
  const [added, setAdded] = useState<string[]>(['hotel'])
  const [settled, setSettled] = useState(false)

  const { yourNet, owing } = useMemo(() => {
    const expenses: ExpenseEntry[] = BILLS.filter((b) => added.includes(b.id)).map(
      (bill, index) => {
        const shares = splitEqually(fromMajor(bill.total, INR), GROUP.length, index)
        return {
          id: bill.id,
          description: bill.label,
          payers: [{ ref: bill.payer, amount: fromMajor(bill.total, INR) }],
          shares: GROUP.map((ref, i) => ({ ref, amount: shares[i] })),
        }
      },
    )

    if (settled) {
      return { yourNet: zero(INR), owing: [] as { ref: string; amount: Money }[] }
    }

    const net = netBalances(expenses, [], INR)
    const edges = pairwiseDebts(expenses, [], INR)

    // Only the edges you are standing on either side of.
    const mine = edges
      .filter((e) => e.from === YOU || e.to === YOU)
      .map((e) => ({
        ref: e.from === YOU ? e.to : e.from,
        amount: e.from === YOU ? money(-e.amount.minor, INR) : e.amount,
      }))

    return { yourNet: net.get(YOU) ?? zero(INR), owing: mine }
  }, [added, settled])

  const toggle = (id: string) => {
    setSettled(false)
    setAdded((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  const reset = () => {
    setAdded(['hotel'])
    setSettled(false)
  }

  const answer = settled
    ? 'Settled. Nothing baaki.'
    : added.length === 0
      ? 'Add a bill and the answer appears here.'
      : yourNet.minor < 0n
        ? 'is what you owe'
        : yourNet.minor > 0n
          ? 'is what the group owes you'
          : 'Even. Nobody owes anybody.'

  const heaviest = owing.reduce(
    (acc, o) => (absMinor(o.amount) > acc ? absMinor(o.amount) : acc),
    0n,
  )

  return (
    <section className="relative pb-20">
      {/**
       * The question owns the first screen, and the answer starts under it.
       *
       * A fixed margin cannot promise that: on a 900px laptop the amount was
       * peeking in at 658px, which gives away the answer before the question
       * has landed. Sizing this block against the viewport instead means the
       * axis begins below the fold at any height, and scrolling one notch is
       * what answers the question.
       */}
      <div className="mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-6xl flex-col justify-center px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Bill splitting, without the paywall
        </p>

        {/**
         * The break after "baaki" is written, not left to the column width.
         *
         * The two lines are the composition: the question stacks, and "hai?"
         * lands under it with the mark of the question set apart. Letting it
         * wrap on its own made that break a function of the window, which is
         * how it ended up on one line at some sizes and orphaned at others.
         */}
        {/**
         * Pulled left by its own side bearing so the stem of the "k" lands on
         * the same line as everything else, rather than the glyph's invisible
         * box doing. At 152px that bearing is 10px, which is plainly visible
         * against a label with none. In em so it holds at every size.
         */}
        <h1 className="mt-6 -ml-[0.066em] font-display text-[clamp(3rem,11.5vw,9.5rem)] font-semibold leading-[0.86] tracking-[-0.045em]">
          kitna <span className="text-pos">baaki</span>
          <br />
          hai<span className="text-neg">?</span>
        </h1>

        <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
          The question every group chat ends with. Baaki answers it the moment a bill
          lands, and settles it over UPI in one tap.
        </p>

        <p
          className="mt-14 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
          aria-hidden
        >
          <span className="h-px w-10 bg-rule" />
          the answer, live
        </p>
      </div>

      {/* The answer deliberately starts below the fold. The question gets the
          opening screen to itself; scrolling one notch is what answers it.

          The axis runs the full width of the viewport - the one thing on this
          page allowed to break the column, because it is the idea. */}
      <div className="relative select-none">
        <Ruler className="absolute inset-x-0 top-0" />

        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="relative -mt-px flex flex-col items-center pt-10">
            <AnimatedAmount value={yourNet} />
            <p
              className={cn(
                'mt-3 text-sm',
                settled ? 'text-pos' : 'text-muted',
                added.length === 0 && 'text-muted',
              )}
            >
              {answer}
            </p>
          </div>

          <div className="mt-10 flex h-10 items-stretch justify-center gap-1.5">
            <AnimatePresence initial={false}>
              {owing.map((o) => (
                <motion.div
                  key={o.ref}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{
                    width:
                      heaviest === 0n
                        ? 0
                        : `${(Number(absMinor(o.amount)) / Number(heaviest)) * 34 + 6}%`,
                    opacity: 1,
                  }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 240, damping: 28 }
                  }
                  className={cn(
                    'flex min-w-0 flex-col justify-center rounded-[3px] px-3',
                    o.amount.minor < 0n ? 'bg-neg' : 'bg-pos',
                  )}
                >
                  <span className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-paper">
                    {NAMES[o.ref]}
                  </span>
                  <span className="truncate text-sm font-medium text-paper">
                    {formatMoney(abs(o.amount))}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            {owing.length === 0 ? 'nothing outstanding' : 'per person, not just a total'}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-14 w-full max-w-6xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Try it, add a bill
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {BILLS.map((bill) => {
            const on = added.includes(bill.id) && !settled
            return (
              <button
                key={bill.id}
                type="button"
                onClick={() => toggle(bill.id)}
                aria-pressed={on}
                className={cn(
                  'rounded-full border px-4 py-2.5 text-sm transition-colors',
                  on
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule hover:border-ink hover:bg-paper-sunken',
                )}
              >
                {bill.label}{' '}
                <span className={cn('tabular-nums', on ? 'text-paper/70' : 'text-muted')}>
                  {formatMoney(fromMajor(bill.total, INR))}
                </span>
              </button>
            )
          })}

          {added.length > 0 && !settled && (
            <button
              type="button"
              onClick={() => setSettled(true)}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              Settle up
            </button>
          )}

          {settled && (
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-rule px-4 py-2.5 text-sm transition-colors hover:border-ink"
            >
              Again
            </button>
          )}
        </div>

        <p className="mt-4 max-w-md text-sm text-muted">
          Four people, split equally. Priya paid for the house, you paid for dinner, Rahul
          paid the cab. Nobody has to work out who ends up short.
        </p>
      </div>
    </section>
  )
}

function absMinor(m: Money): bigint {
  return m.minor < 0n ? -m.minor : m.minor
}

function abs(m: Money): Money {
  return money(absMinor(m), m.currency)
}
