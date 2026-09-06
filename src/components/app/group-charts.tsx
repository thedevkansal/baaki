'use client'

import { useMemo } from 'react'
import { SectionMark } from '@/components/ui/ruler'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { money } from '@/lib/money'
import type { Expense, Person } from '@/lib/store/types'

/**
 * Charts, free.
 *
 * Splitwise puts "charts and graphs" behind Pro. These are the two questions a
 * group actually asks: where did the money go, and who has been carrying it.
 *
 * Both are magnitude comparisons rather than identity, so they use one hue and
 * let length do the work. No categorical palette, no extra colours in a system
 * that deliberately has six. The paid-against-share pair is the exception: two
 * series, so it takes the two poles of the axis and a legend.
 *
 * Bars grow from zero on arrival. The growth is the point: a bar that is
 * already at full length is a number in a costume, one that draws itself shows
 * you the size of the thing.
 */

function Bar({
  fraction,
  tone,
  index,
}: {
  fraction: number
  tone: 'pos' | 'neg'
  index: number
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken">
      <div
        className={cn(
          'grow-x h-full w-full rounded-full',
          tone === 'pos' ? 'bg-pos' : 'bg-neg',
        )}
        style={{
          transform: `scaleX(${Math.max(fraction, 0)})`,
          // Staggered by duration rather than delay, so no bar is ever
          // waiting at zero length.
          ['--grow-duration' as string]: `${520 + index * 70}ms`,
        }}
      />
    </div>
  )
}

export function GroupCharts({
  expenses,
  members,
  currency,
}: {
  expenses: Expense[]
  members: Person[]
  currency: string
}) {
  const { byCategory, byPerson, total } = useMemo(() => {
    const categories = new Map<string, bigint>()
    const paid = new Map<string, bigint>()
    const consumed = new Map<string, bigint>()
    let running = 0n

    for (const expense of expenses) {
      const amount = expense.shares.reduce((acc, s) => acc + BigInt(s.minor), 0n)
      running += amount
      categories.set(expense.category, (categories.get(expense.category) ?? 0n) + amount)
      for (const p of expense.payers) {
        paid.set(p.personId, (paid.get(p.personId) ?? 0n) + BigInt(p.minor))
      }
      for (const s of expense.shares) {
        consumed.set(s.personId, (consumed.get(s.personId) ?? 0n) + BigInt(s.minor))
      }
    }

    return {
      total: running,
      byCategory: [...categories.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => Number(b.value - a.value)),
      byPerson: members.map((m) => ({
        person: m,
        paid: paid.get(m.id) ?? 0n,
        consumed: consumed.get(m.id) ?? 0n,
      })),
    }
  }, [expenses, members])

  const categoryMax = byCategory.reduce((acc, r) => (r.value > acc ? r.value : acc), 0n)
  const personMax = byPerson.reduce(
    (acc, r) => (r.paid > acc ? r.paid : r.consumed > acc ? r.consumed : acc),
    0n,
  )

  const share = (value: bigint, max: bigint) =>
    max === 0n ? 0 : Number(value) / Number(max)

  if (expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-rule px-6 py-14 text-center">
        <p className="font-display text-xl tracking-[-0.02em]">Nothing to chart yet</p>
        <p className="mt-2 text-sm text-muted">Add a bill and the shape appears here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <SectionMark label="Where it went" />
          <span className="font-mono text-sm tabular-nums text-muted">
            {formatMoney(money(total, currency))}
          </span>
        </div>

        <ul className="mt-6 space-y-4">
          {byCategory.map((row, index) => (
            <li
              key={row.label}
              className="group/row rounded-lg px-2 py-1 transition-colors hover:bg-paper-sunken"
              title={`${row.label}: ${formatMoney(money(row.value, currency))} of ${formatMoney(money(total, currency))}`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate text-sm">{row.label}</span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                  {formatMoney(money(row.value, currency))}
                  <span className="ml-2 opacity-0 transition-opacity group-hover/row:opacity-100">
                    {Math.round(share(row.value, total) * 100)}%
                  </span>
                </span>
              </div>
              <div className="mt-2">
                <Bar fraction={share(row.value, categoryMax)} tone="pos" index={index} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionMark label="Who has been carrying it" />

        <div className="mt-4 flex items-center gap-5 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-pos" aria-hidden /> paid
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-neg" aria-hidden /> their share
          </span>
        </div>

        <ul className="mt-6 space-y-5">
          {byPerson.map(({ person, paid, consumed }, index) => (
            <li
              key={person.id}
              className="rounded-lg px-2 py-1 transition-colors hover:bg-paper-sunken"
              title={`${person.name} paid ${formatMoney(money(paid, currency))} and used ${formatMoney(money(consumed, currency))}`}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate text-sm">{person.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {formatMoney(money(paid, currency))} paid ·{' '}
                  {formatMoney(money(consumed, currency))} used
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <Bar fraction={share(paid, personMax)} tone="pos" index={index} />
                <Bar fraction={share(consumed, personMax)} tone="neg" index={index + 1} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
