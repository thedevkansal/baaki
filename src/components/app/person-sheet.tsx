'use client'

import { Avatar } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { money, type Money } from '@/lib/money'
import type { Expense, Person } from '@/lib/store/types'

/**
 * One person, and only what you have in common with them.
 *
 * The People tab showed a name and a number and did nothing when tapped, which
 * left the obvious question unanswered: what is that number made of?
 */
export function PersonSheet({
  open,
  onOpenChange,
  person,
  isMe,
  net,
  yourPosition,
  expenses,
  currency,
  meId,
  nameOf,
  onSettle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: Person
  isMe: boolean
  /** Their standing with the whole group. */
  net: Money
  /** What sits between the two of you, signed from your side. */
  yourPosition?: Money
  expenses: Expense[]
  currency: string
  meId: string
  nameOf: (personId: string) => string
  onSettle?: () => void
}) {
  const shared = expenses.filter(
    (expense) =>
      expense.shares.some((s) => s.personId === person.id && BigInt(s.minor) !== 0n) ||
      expense.payers.some((p) => p.personId === person.id),
  )

  const theyPaid = shared.reduce(
    (acc, e) =>
      acc +
      e.payers.reduce((a, p) => (p.personId === person.id ? a + BigInt(p.minor) : a), 0n),
    0n,
  )
  const theyUsed = shared.reduce(
    (acc, e) =>
      acc +
      e.shares.reduce((a, s) => (s.personId === person.id ? a + BigInt(s.minor) : a), 0n),
    0n,
  )

  const owesYou = yourPosition && yourPosition.minor > 0n
  const youOwe = yourPosition && yourPosition.minor < 0n

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isMe ? 'You' : person.name}
      footer={
        youOwe && onSettle ? (
          <Button variant="primary" className="w-full" onClick={onSettle}>
            Settle {formatMoney(money(-yourPosition.minor, currency))} with {person.name}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-7">
        <div className="flex items-center gap-4 rounded-2xl border border-rule bg-paper-raised px-5 py-5">
          <Avatar name={person.name} className="h-11 w-11 text-sm" />
          <div className="min-w-0 flex-1">
            {/* The sign and the colour already say the direction, so the
                label says the scope instead of repeating it. */}
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Across this group
            </p>
            <p
              className={cn(
                'font-display text-3xl leading-none tracking-[-0.02em]',
                net.minor < 0n ? 'text-neg' : net.minor > 0n ? 'text-pos' : 'text-ink',
              )}
            >
              {formatMoney(net)}
            </p>
          </div>
        </div>

        {!isMe && yourPosition && (
          <p className="rounded-xl bg-paper-sunken px-4 py-3 text-sm">
            <span className="text-muted">Between you two: </span>
            {youOwe ? `you owe ${person.name} ` : owesYou ? `${person.name} owes you ` : ''}
            {yourPosition.minor === 0n ? (
              'nothing outstanding.'
            ) : (
              <span
                className={cn('font-mono tabular-nums', youOwe ? 'text-neg' : 'text-pos')}
              >
                {formatMoney(
                  money(
                    yourPosition.minor < 0n ? -yourPosition.minor : yourPosition.minor,
                    currency,
                  ),
                )}
              </span>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-rule px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              Put in
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums">
              {formatMoney(money(theyPaid, currency))}
            </p>
          </div>
          <div className="rounded-xl border border-rule px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              Used
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums">
              {formatMoney(money(theyUsed, currency))}
            </p>
          </div>
        </div>

        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            {shared.length} {shared.length === 1 ? 'bill' : 'bills'}
          </p>
          <ul className="mt-3 space-y-2">
            {shared.map((expense) => {
              const theirShare =
                expense.shares.find((s) => s.personId === person.id)?.minor ?? '0'
              const total = expense.shares.reduce((acc, s) => acc + BigInt(s.minor), 0n)
              const paidThis = expense.payers.some((p) => p.personId === person.id)
              return (
                <li
                  key={expense.id}
                  className="flex items-center gap-4 rounded-xl border border-rule px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{expense.description}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {paidThis
                        ? `${isMe ? 'You' : person.name} paid`
                        : `${expense.payers.map((p) => nameOf(p.personId)).join(', ')} paid`}{' '}
                      · {expense.occurredOn}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm tabular-nums">
                      {formatMoney(money(total, currency))}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      {person.id === meId ? 'you' : 'their share'}{' '}
                      {formatMoney(money(BigInt(theirShare), currency))}
                    </p>
                  </div>
                </li>
              )
            })}
            {shared.length === 0 && (
              <li className="rounded-xl border border-dashed border-rule px-4 py-8 text-center text-sm text-muted">
                Nothing shared yet.
              </li>
            )}
          </ul>
        </div>
      </div>
    </Sheet>
  )
}
