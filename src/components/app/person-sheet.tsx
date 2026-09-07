'use client'

import { useState } from 'react'
import { Avatar, inputClass } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { money, type Money } from '@/lib/money'
import { removePersonFromGroup, renamePerson, setPersonVpa } from '@/lib/store/store'
import { makeAdmin } from '@/lib/sync/actions'
import { isValidVpa } from '@/lib/upi/link'
import type { Expense, Group, Person } from '@/lib/store/types'

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
  groupId,
  group,
  settledWith,
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
  /** Needed to know what this device is allowed to change about them. */
  group: Group
  /** Whether any payment in this group involves them. */
  settledWith: boolean
  groupId: string
}) {
  const [name, setName] = useState(person.name)
  const [removeError, setRemoveError] = useState<string | null>(null)

  /**
   * What this device may change about this person.
   *
   * Your own name and UPI ID are yours. Everyone else's are theirs, the moment
   * they have a phone of their own in the group: nobody else can spell their
   * name for them, and a VPA typed by somebody else sends money to a stranger.
   * Until they turn up their name is a placeholder the owner can still fix.
   * Removing anybody is the owner's alone.
   */
  const [vpa, setVpa] = useState(person.vpa ?? '')
  const vpaLooksWrong = vpa.trim() !== '' && !isValidVpa(vpa.trim())
  const dirty = name.trim() !== person.name || vpa.trim() !== (person.vpa ?? '')

  const unclaimed = group.shared ? !(group.claimed ?? []).includes(person.id) : true
  const isOwner = group.shared ? group.owner === true : true
  const canRename = isMe || (isOwner && unclaimed)
  const canEditVpa = isMe
  const canRemove = isOwner
  const isTheirAdmin = (group.admins ?? []).includes(person.id)
  const [promoting, setPromoting] = useState(false)
  const shared = expenses.filter(
    (expense) =>
      expense.shares.some((s) => s.personId === person.id && BigInt(s.minor) !== 0n) ||
      expense.payers.some((p) => p.personId === person.id),
  )

  /**
   * Everything that would be orphaned by removing them: bills and payments.
   * The old gate looked only at bills, so somebody who had only ever settled up
   * was offered a button the store then refused.
   */
  const onSomething = shared.length > 0 || settledWith

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

        {(canRename || canEditVpa) && (
          <div className="rounded-xl border border-rule px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              {isMe ? 'You' : 'Name'}
            </p>
            <input
              className={`${inputClass} mt-3`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label={`Name for ${person.name}`}
              placeholder="Name"
            />

            {canEditVpa && (
              <input
                className={`${inputClass} mt-2 font-mono`}
                value={vpa}
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Your UPI ID"
                aria-label="Your UPI ID"
                onChange={(event) => setVpa(event.target.value)}
              />
            )}

            {vpaLooksWrong && (
              <p className="mt-2 text-xs text-neg">
                That does not look like a UPI ID. Example: rahul@okhdfcbank
              </p>
            )}

            {/**
              * One Save for both. The UPI field used to write on every
              * keystroke, which sent a push per character and meant the Save
              * button beside it was only ever saving the name.
              */}
            <Button
              size="sm"
              className="mt-3"
              disabled={!dirty || !name.trim() || vpaLooksWrong}
              onClick={() => {
                if (name.trim() !== person.name) renamePerson(person.id, name)
                if (canEditVpa && vpa.trim() !== (person.vpa ?? '')) {
                  setPersonVpa(person.id, vpa)
                }
              }}
            >
              {dirty ? 'Save' : 'Saved'}
            </Button>

            {!isMe && canRename && (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                A placeholder until they open the invite. Once they do, their name and
                UPI ID are theirs to set.
              </p>
            )}
          </div>
        )}

        {!isMe && !canRename && shared.length === 0 && (
          <p className="px-1 text-xs leading-relaxed text-muted">
            {group.shared
              ? 'They set their own name and UPI ID from their phone.'
              : 'Only they can change their name and UPI ID once they join.'}
          </p>
        )}

        {!isMe && canRemove && (
          <div className="rounded-xl border border-rule px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              {group.shared && !isTheirAdmin ? 'Admin and removal' : 'Remove'}
            </p>

            {group.shared && !isTheirAdmin && (
              <>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  An admin can invite, remove people and fix names nobody has claimed.
                  Nobody can be demoted, so a group is never left without one.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={promoting}
                  onClick={async () => {
                    setPromoting(true)
                    const result = await makeAdmin(groupId, person.id)
                    setPromoting(false)
                    setRemoveError(result.ok ? null : (result.message ?? null))
                  }}
                >
                  {promoting ? 'Making them an admin…' : `Make ${person.name} an admin`}
                </Button>
              </>
            )}

            {/**
              * A button that cannot do anything is worse than no button: it
              * reads as broken rather than as refused. When somebody is on a
              * bill, the thing standing in the way is the bill, so say that and
              * say how many.
              */}
            {onSomething ? (
              <p className="mt-4 text-xs leading-relaxed text-muted">
                {person.name} is on {shared.length} {shared.length === 1 ? 'bill' : 'bills'}{' '}
                here, so they cannot be taken out: their share would be owed by nobody.
                Take them off those bills first, or delete the bills.
              </p>
            ) : (
              <>
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  They are not on anything yet, so they can be taken out cleanly.
                </p>
                <Button
                  size="sm"
                  variant="danger"
                  className="mt-3"
                  onClick={() => {
                    const result = removePersonFromGroup(groupId, person.id)
                    if (result.removed) onOpenChange(false)
                    else setRemoveError(result.reason ?? null)
                  }}
                >
                  Remove from group
                </Button>
              </>
            )}
            {removeError && <p className="mt-2 text-xs text-neg">{removeError}</p>}
          </div>
        )}
      </div>
    </Sheet>
  )
}
