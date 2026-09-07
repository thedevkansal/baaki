'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { AddExpenseSheet } from '@/components/app/add-expense-sheet'
import { GroupCharts } from '@/components/app/group-charts'
import { GroupSettingsSheet } from '@/components/app/group-settings-sheet'
import { PersonSheet } from '@/components/app/person-sheet'
import { SettleSheet } from '@/components/app/settle-sheet'
import { BalanceBeam } from '@/components/beam/balance-beam'
import { Button } from '@/components/ui/button'
import { Avatar, Field, SegmentedControl, inputClass } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { money, type Money } from '@/lib/money'
import { describeDue, dueOccurrences } from '@/lib/recurring'
import {
  addDueOccurrences,
  addPerson,
  deleteExpense,
  deleteSettlement,
  setSettlementStatus,
} from '@/lib/store/store'
import { personIdOf, useAppState, useGroupLedger } from '@/lib/store/use-store'
import type { Person } from '@/lib/store/types'

type Tab = 'balances' | 'activity' | 'charts'

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
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

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

  /**
   * Bills and settled payments in one list, newest first.
   *
   * A confirmed settlement used to vanish once it moved the balances, which
   * left no answer to "did I already pay Priya?" and no way back from
   * confirming one by mistake.
   */
  const needle = query.trim().toLowerCase()

  type Item =
    | { kind: 'expense'; at: string; expense: (typeof expenses)[number] }
    | { kind: 'settlement'; at: string; settlement: (typeof settlements)[number] }

  const activity: Item[] = [
    ...expenses.map((expense) => ({
      kind: 'expense' as const,
      at: expense.occurredOn,
      expense,
    })),
    ...settlements
      .filter((s) => s.status === 'confirmed')
      .map((settlement) => ({
        kind: 'settlement' as const,
        at: settlement.createdAt.slice(0, 10),
        settlement,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const searchText = (item: Item) =>
    (item.kind === 'expense'
      ? [
          item.expense.description,
          item.expense.category,
          ...item.expense.payers.map((p) => ledger.nameOf(p.personId)),
        ]
      : [
          // Words people actually type when hunting for a payment.
          'settlement payment paid settled',
          ledger.nameOf(item.settlement.fromId),
          ledger.nameOf(item.settlement.toId),
          item.settlement.method,
        ]
    )
      .join(' ')
      .toLowerCase()

  const visibleActivity = needle
    ? activity.filter((item) => searchText(item).includes(needle))
    : activity
  /**
   * Repeats that have come due but have not been entered.
   *
   * Nothing is created automatically. A bill appearing in your ledger without
   * you putting it there is a bill you then have to check, so this offers and
   * waits.
   */
  const today = new Date().toISOString().slice(0, 10)
  const dueSeries = expenses
    .filter((expense) => expense.repeat)
    .map((template) => {
      const entered = expenses
        .filter((e) => e.id === template.id || e.repeatOf === template.id)
        .map((e) => e.occurredOn)
      return {
        template,
        due: dueOccurrences(template.occurredOn, template.repeat!, entered, today),
      }
    })
    .filter((series) => series.due.length > 0)

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
          <div className="mt-2 flex items-center gap-2">
            <h1 className="min-w-0 truncate font-display text-3xl tracking-[-0.03em]">
              {group.name}
            </h1>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Group settings"
              className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-paper-sunken hover:text-ink"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
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

        {yourSplit.length > 0 && (
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            your position with each person
          </p>
        )}

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

      {dueSeries.length > 0 && (
        <ul className="mt-6 space-y-2">
          {dueSeries.map(({ template, due }) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-paper-raised px-4 py-3"
            >
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{template.description}</span> repeats.{' '}
                {describeDue(due.length, template.repeat!)}.
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => addDueOccurrences(template.id, due)}
              >
                Add {due.length === 1 ? 'it' : `all ${due.length}`}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <ul className="mt-6 space-y-2">
          {pending.map((s) => {
            const iPaid = s.fromId === state.meId
            const paidMe = s.toId === state.meId
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
                      {amount}. Waiting for them to confirm.
                    </>
                  ) : paidMe ? (
                    <>
                      <span className="font-medium">{ledger.nameOf(s.fromId)}</span> says
                      they paid you {amount}.
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{ledger.nameOf(s.fromId)}</span> says
                      they paid <span className="font-medium">{ledger.nameOf(s.toId)}</span>{' '}
                      {amount}.
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
                    {paidMe ? 'Confirm' : `${ledger.nameOf(s.toId)} confirmed`}
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
          { value: 'activity', label: `Activity (${activity.length})` },
          { value: 'charts', label: 'Charts' },
        ]}
      />

      <div className="mt-6">
        {tab === 'balances' && (
          <>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              everyone&rsquo;s standing with the whole group
            </p>
            <ul className="space-y-2">
              {ledger.balances.map(({ person, net }, index) => (
                <li
                  key={person.id}
                  className="rise"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => setViewing(person.id)}
                    aria-label={`${person.name}, ${formatMoney(net)}`}
                    className="flex w-full items-center gap-3 rounded-xl border border-rule px-4 py-3 text-left transition-colors hover:border-ink"
                  >
                    <Avatar name={person.name} />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="min-w-0 truncate text-sm">{person.name}</span>
                      {person.id === state.meId && (
                        <span className="shrink-0 rounded-full border border-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                          you
                        </span>
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
                  </button>
                </li>
              ))}
            </ul>
            <Button className="mt-4 w-full" onClick={() => setAddingPerson(true)}>
              Add someone
            </Button>
          </>
        )}

        {tab === 'activity' && (
          <>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bills, people, payments"
              aria-label="Search this group"
              className={cn(inputClass, 'mb-3')}
            />
            <ul className="space-y-2">
              {visibleActivity.map((item, index) => {
                if (item.kind === 'settlement') {
                  const { settlement } = item
                  const iPaid = settlement.fromId === state.meId
                  return (
                    <li
                      key={settlement.id}
                      className="rise group flex items-center gap-2 rounded-xl border border-rule bg-paper-sunken py-3 pl-4 pr-2"
                      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {iPaid
                            ? `You paid ${ledger.nameOf(settlement.toId)}`
                            : `${ledger.nameOf(settlement.fromId)} paid ${
                                settlement.toId === state.meId
                                  ? 'you'
                                  : ledger.nameOf(settlement.toId)
                              }`}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          Settled · {settlement.method} · {item.at}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-sm tabular-nums text-muted">
                        {formatMoney(money(BigInt(settlement.minor), currency))}
                      </p>
                      <button
                        type="button"
                        onClick={() => deleteSettlement(settlement.id)}
                        aria-label="Undo this settlement"
                        className="shrink-0 rounded-full p-1.5 text-muted opacity-0 transition-opacity hover:text-neg focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                          <path
                            d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </li>
                  )
                }

                const { expense } = item
                const total = expense.shares.reduce((acc, s) => acc + BigInt(s.minor), 0n)
                const paidBy = expense.payers
                  .map((p) => ledger.nameOf(p.personId))
                  .join(', ')
                const yourShare =
                  expense.shares.find((s) => s.personId === state.meId)?.minor ?? '0'
                return (
                  <li
                    key={expense.id}
                    className="rise group flex items-center gap-2 rounded-xl border border-rule pr-2 transition-colors hover:border-ink"
                    style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => setEditing(expense.id)}
                      aria-label={`Edit ${expense.description}`}
                      className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-4 py-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {expense.description}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {paidBy || 'nobody'} paid · {expense.category} ·{' '}
                          {expense.occurredOn}
                          {expense.original &&
                            ` · ${formatMoney(
                              money(
                                BigInt(expense.original.minor),
                                expense.original.currency,
                              ),
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
                    </button>
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
              {visibleActivity.length === 0 && (
                <li className="rounded-xl border border-dashed border-rule px-6 py-12 text-center text-sm text-muted">
                  {activity.length === 0
                    ? 'Add the first expense.'
                    : `Nothing matches "${query.trim()}".`}
                </li>
              )}
            </ul>
          </>
        )}

        {tab === 'charts' && (
          <GroupCharts expenses={expenses} members={members} currency={currency} />
        )}
      </div>

      {viewing &&
        (() => {
          const person = ledger.personOf(viewing)
          if (!person) return null
          const entry = ledger.balances.find((b) => b.person.id === viewing)
          const pair = yourSplit.find((p) => p.person.id === viewing)
          return (
            <PersonSheet
              open
              onOpenChange={(next) => !next && setViewing(null)}
              person={person}
              isMe={person.id === state.meId}
              net={entry?.net ?? money(0n, currency)}
              yourPosition={pair?.amount}
              expenses={expenses}
              currency={currency}
              meId={state.meId}
              nameOf={ledger.nameOf}
              onSettle={
                pair && pair.amount.minor < 0n
                  ? () => {
                      setViewing(null)
                      setSettling({
                        to: person,
                        amount: money(-pair.amount.minor, currency),
                      })
                    }
                  : undefined
              }
            />
          )
        })()}

      {settingsOpen && (
        <GroupSettingsSheet
          open
          onOpenChange={setSettingsOpen}
          group={group}
          expenseCount={expenses.length}
          members={members}
          expenses={expenses}
          settlements={settlements}
          nameOf={ledger.nameOf}
        />
      )}

      {editing &&
        (() => {
          const expense = expenses.find((e) => e.id === editing)
          if (!expense) return null
          return (
            <AddExpenseSheet
              open
              onOpenChange={(next) => !next && setEditing(null)}
              groupId={groupId}
              currency={currency}
              members={members}
              defaultPayerId={me?.id ?? members[0]?.id ?? ''}
              splitSeed={expenses.length}
              existing={expense}
            />
          )
        })()}

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
