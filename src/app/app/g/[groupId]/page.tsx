'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { AddExpenseSheet } from '@/components/app/add-expense-sheet'
import { GroupCharts } from '@/components/app/group-charts'
import { SettleSheet } from '@/components/app/settle-sheet'
import { BalanceBeam } from '@/components/beam/balance-beam'
import { Button } from '@/components/ui/button'
import { Avatar, Field, SegmentedControl, inputClass } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { money, type Money } from '@/lib/money'
import {
  addPerson,
  deleteExpense,
  deleteSettlement,
  setSettlementStatus,
} from '@/lib/store/store'
import { personIdOf, useAppState, useGroupLedger } from '@/lib/store/use-store'
import type { Person } from '@/lib/store/types'

type Tab = 'balances' | 'expenses' | 'charts'

export default function GroupPage({ params }: PageProps<'/app/g/[groupId]'>) {
  const { groupId } = use(params)
  const state = useAppState()
  const ledger = useGroupLedger(groupId)

  const [tab, setTab] = useState<Tab>('balances')
  const [adding, setAdding] = useState(false)
  const [addingPerson, setAddingPerson] = useState(false)
  const [newName, setNewName] = useState('')
  const [settling, setSettling] = useState<{ to: Person; amount: Money } | null>(null)
  const [why, setWhy] = useState<number | null>(null)
  const [focused, setFocused] = useState<string | null>(null)

  const { group, members, me, expenses, settlements, yourNet, yourSplit } = ledger

  if (!group) {
    return (
      <div className="rounded-2xl border border-dashed border-rule px-6 py-14 text-center">
        <p className="font-display text-2xl tracking-[-0.02em]">Group not found</p>
        <p className="mt-3 text-sm text-muted">
          It may have been deleted, or stored on another device.
        </p>
        <Button asChild className="mt-7">
          <Link href="/app">Back to your groups</Link>
        </Button>
      </div>
    )
  }

  const currency = group.currency
  const pending = settlements.filter((s) => s.status === 'proposed')
  const focusedPerson = yourSplit.find((s) => s.person.id === focused)
  const myTransfers = ledger.transfers
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => personIdOf(t.from) === state.meId)

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/app"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            ← all groups
          </Link>
          <h1 className="mt-2 truncate font-display text-3xl tracking-[-0.03em]">
            {group.name}
          </h1>
        </div>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          Add expense
        </Button>
      </div>

      <div className="mt-8 rounded-2xl border border-rule bg-paper-raised px-6 py-9">
        <BalanceBeam
          currency={currency}
          segments={yourSplit.map(({ person, amount }) => ({
            id: person.id,
            label: person.name,
            amount,
          }))}
          selectedId={focused}
          onSelect={setFocused}
          caption={
            expenses.length === 0
              ? 'nothing added yet'
              : yourNet.minor < 0n
                ? 'is what you owe in this group'
                : yourNet.minor > 0n
                  ? 'is what this group owes you'
                  : 'you are square with everyone'
          }
        />

        {focusedPerson && (
          <p className="mt-6 rounded-xl bg-paper px-4 py-3 text-sm">
            {focusedPerson.amount.minor < 0n
              ? `You owe ${focusedPerson.person.name}`
              : `${focusedPerson.person.name} owes you`}{' '}
            <span
              className={cn(
                'font-mono tabular-nums',
                focusedPerson.amount.minor < 0n ? 'text-neg' : 'text-pos',
              )}
            >
              {formatMoney(money(abs(focusedPerson.amount.minor), currency))}
            </span>
          </p>
        )}

        {myTransfers.length > 0 && (
          <div className="mt-6 w-full space-y-2">
            {myTransfers.map(({ t, index }) => {
              const to = ledger.personOf(personIdOf(t.to))
              if (!to) return null
              return (
                <div
                  key={`${t.from}-${t.to}`}
                  className="rounded-xl border border-rule px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">
                      Settle with <span className="font-medium">{to.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-neg">
                      {formatMoney(t.amount)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="flex-1"
                      onClick={() => setSettling({ to, amount: t.amount })}
                    >
                      Settle up
                    </Button>
                    <Button size="sm" onClick={() => setWhy(index)}>
                      Why this?
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <ul className="mt-6 space-y-2">
          {pending.map((s) => {
            const iPaid = s.fromId === state.meId
            const amount = formatMoney(money(BigInt(s.minor), currency))
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-paper-raised px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-sm">
                  {iPaid ? (
                    <>
                      You paid <span className="font-medium">{ledger.nameOf(s.toId)}</span>{' '}
                      {amount}. Waiting for them to confirm
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{ledger.nameOf(s.fromId)}</span> says
                      they paid you {amount}
                    </>
                  )}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => deleteSettlement(s.id)}>
                    {iPaid ? 'Undo' : 'Not yet'}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setSettlementStatus(s.id, 'confirmed')}
                  >
                    {iPaid ? `${ledger.nameOf(s.toId)} confirmed` : 'Confirm'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <SegmentedControl
        className="mt-8 w-full"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'balances', label: 'People' },
          { value: 'expenses', label: `Expenses (${expenses.length})` },
          { value: 'charts', label: 'Charts' },
        ]}
      />

      <div className="mt-6">
        {tab === 'balances' && (
          <>
            <ul className="space-y-2">
              {ledger.balances.map(({ person, net }, index) => (
                <li
                  key={person.id}
                  className="rise flex items-center gap-3 rounded-xl border border-rule px-4 py-3 transition-colors hover:border-ink"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Avatar name={person.name} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {person.name}
                    {person.id === state.meId && (
                      <span className="ml-2 text-xs text-muted">you</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 font-mono text-sm tabular-nums',
                      net.minor < 0n
                        ? 'text-neg'
                        : net.minor > 0n
                          ? 'text-pos'
                          : 'text-muted',
                    )}
                  >
                    {formatMoney(net)}
                  </span>
                </li>
              ))}
            </ul>
            <Button className="mt-4 w-full" onClick={() => setAddingPerson(true)}>
              Add someone
            </Button>
          </>
        )}

        {tab === 'expenses' && (
          <ul className="space-y-2">
            {expenses.map((expense, index) => {
              const total = expense.shares.reduce((acc, s) => acc + BigInt(s.minor), 0n)
              const paidBy = expense.payers.map((p) => ledger.nameOf(p.personId)).join(', ')
              const yourShare =
                expense.shares.find((s) => s.personId === state.meId)?.minor ?? '0'
              return (
                <li
                  key={expense.id}
                  className="rise group flex items-center gap-4 rounded-xl border border-rule px-4 py-3 transition-colors hover:border-ink"
                  style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{expense.description}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {paidBy || 'nobody'} paid · {expense.category} · {expense.occurredOn}
                      {expense.original &&
                        ` · ${formatMoney(
                          money(BigInt(expense.original.minor), expense.original.currency),
                        )}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm tabular-nums">
                      {formatMoney(money(total, currency))}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      you {formatMoney(money(BigInt(yourShare), currency))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteExpense(expense.id)}
                    aria-label={`Delete ${expense.description}`}
                    className="shrink-0 rounded-full p-1.5 text-muted opacity-0 transition-opacity hover:text-neg focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </li>
              )
            })}
            {expenses.length === 0 && (
              <li className="rounded-xl border border-dashed border-rule px-6 py-12 text-center text-sm text-muted">
                Add the first expense.
              </li>
            )}
          </ul>
        )}

        {tab === 'charts' && (
          <GroupCharts expenses={expenses} members={members} currency={currency} />
        )}
      </div>

      {adding && (
        <AddExpenseSheet
          open
          onOpenChange={setAdding}
          groupId={groupId}
          currency={currency}
          members={members}
          defaultPayerId={me?.id ?? members[0]?.id ?? ''}
          splitSeed={expenses.length}
        />
      )}

      {settling && me && (
        <SettleSheet
          open
          onOpenChange={(next) => !next && setSettling(null)}
          groupId={groupId}
          groupName={group.name}
          from={me}
          to={settling.to}
          amount={settling.amount}
        />
      )}

      <Sheet
        open={why !== null}
        onOpenChange={(next) => !next && setWhy(null)}
        title="Why this payment?"
        description="Simplifying a group means you may pay someone you never bought anything with. Here is what it replaced."
      >
        {why !== null &&
          (() => {
            const provenance = ledger.provenance[why]
            const transfer = ledger.transfers[why]
            return (
              <div className="space-y-6">
                <p className="text-sm leading-relaxed text-muted">
                  {ledger.transfers.length < ledger.pairwiseCount
                    ? `Instead of ${ledger.pairwiseCount} separate payments across the group, everyone clears in ${ledger.transfers.length}.`
                    : 'Nothing to collapse here yet - this is money you owe directly.'}
                </p>

                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                    This replaces
                  </p>
                  <ul className="mt-3 space-y-2">
                    {provenance.replaces.map((debt) => (
                      <li
                        key={`${debt.from}-${debt.to}`}
                        className="flex items-baseline justify-between gap-4 border-b border-rule pb-2 last:border-0"
                      >
                        <span className="text-sm">
                          You owed {ledger.nameOf(personIdOf(debt.to))}
                        </span>
                        <span className="font-mono text-sm tabular-nums">
                          {formatMoney(debt.amount)}
                        </span>
                      </li>
                    ))}
                    {provenance.replaces.length === 0 && (
                      <li className="text-sm text-muted">Nothing directly owed.</li>
                    )}
                  </ul>
                </div>

                {provenance.offsets.length > 0 && (
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                      Netted off along the way
                    </p>
                    <ul className="mt-3 space-y-2">
                      {provenance.offsets.map((debt) => (
                        <li
                          key={`${debt.from}-${debt.to}`}
                          className="flex items-baseline justify-between gap-4 border-b border-rule pb-2 last:border-0"
                        >
                          <span className="text-sm">
                            {ledger.nameOf(personIdOf(debt.from))} owed you
                          </span>
                          <span className="font-mono text-sm tabular-nums">
                            {formatMoney(debt.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-sm leading-relaxed text-muted">
                  {provenance.exact
                    ? `Paying ${ledger.nameOf(personIdOf(transfer.to))} ${formatMoney(transfer.amount)} settles exactly those debts.`
                    : 'Because money is owed to you as well, this payment is your net position rather than a straight swap for any one debt.'}
                </p>
              </div>
            )
          })()}
      </Sheet>

      <Sheet
        open={addingPerson}
        onOpenChange={setAddingPerson}
        title="Add someone"
        description="A name is enough. No email, no phone number, no invite to accept."
        footer={
          <Button
            variant="primary"
            className="w-full"
            disabled={!newName.trim()}
            onClick={() => {
              addPerson(newName, groupId)
              setNewName('')
              setAddingPerson(false)
            }}
          >
            Add to group
          </Button>
        }
      >
        <Field label="Their name">
          <input
            className={inputClass}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Aman"
            autoFocus
          />
        </Field>
      </Sheet>
    </>
  )
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}
