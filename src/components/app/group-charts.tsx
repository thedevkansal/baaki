'use client'

import { useMemo } from 'react'
import { formatMoney } from '@/lib/format'
import { money } from '@/lib/money'
import type { Expense, Person } from '@/lib/store/types'

/**
 * Charts, free.
 *
 * Splitwise puts "charts and graphs" behind Pro. These are the two questions a
 * group actually asks: where did the money go, and who has been carrying it.
 *
 * Both are magnitude comparisons, not identity, so they use one hue and let
 * length do the work - no categorical palette, no extra colours in a system
 * that deliberately has six. The paid-versus-share pair is the exception: it
 * has two series, so it takes the two poles of the axis and a legend.
 */

interface Row {
  label: string
  value: bigint
}

function Bars({
  rows,
  currency,
  emptyLabel,
}: {
  rows: Row[]
  currency: string
  emptyLabel: string
}) {
  const max = rows.reduce((acc, r) => (r.value > acc ? r.value : acc), 0n)

  if (rows.length === 0 || max === 0n) {
    return <p className="py-6 text-sm text-muted">{emptyLabel}</p>
  }

  return (
    <ul className="mt-4 space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate text-sm">{row.label}</span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
              {formatMoney(money(row.value, currency))}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-paper-sunken">
            <div
              className="h-full rounded-full bg-pos"
              style={{ width: `${(Number(row.value) / Number(max)) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
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

  const personMax = byPerson.reduce(
    (acc, r) => (r.paid > acc ? r.paid : r.consumed > acc ? r.consumed : acc),
    0n,
  )

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            Where it went
          </h3>
          <span className="font-mono text-sm tabular-nums text-muted">
            {formatMoney(money(total, currency))} total
          </span>
        </div>
        <Bars
          rows={byCategory}
          currency={currency}
          emptyLabel="No expenses yet, so nothing to chart."
        />
      </section>

      <section>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Who has been carrying it
        </h3>

        <div className="mt-3 flex items-center gap-5 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-pos" aria-hidden /> paid
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-neg" aria-hidden /> their share
          </span>
        </div>

        {personMax === 0n ? (
          <p className="py-6 text-sm text-muted">Nothing spent yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {byPerson.map(({ person, paid, consumed }) => (
              <li key={person.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 truncate text-sm">{person.name}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {formatMoney(money(paid, currency))} paid ·{' '}
                    {formatMoney(money(consumed, currency))} used
                  </span>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  <div className="h-1.5 w-full rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full bg-pos"
                      style={{ width: `${(Number(paid) / Number(personMax)) * 100}%` }}
                    />
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full bg-neg"
                      style={{ width: `${(Number(consumed) / Number(personMax)) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
