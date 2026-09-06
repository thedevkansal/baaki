'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { Avatar, Field, SegmentedControl, inputClass } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { add, zero } from '@/lib/money'
import { SUPPORTED_CURRENCIES } from '@/lib/fx'
import { addPerson, createGroup, setMyName } from '@/lib/store/store'
import { useAppState, useGroupSummaries } from '@/lib/store/use-store'

export default function GroupsPage() {
  const router = useRouter()
  const state = useAppState()
  const summaries = useGroupSummaries()

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [others, setOthers] = useState('')

  const me = state.people.find((p) => p.id === state.meId)
  const overall = summaries.reduce((acc, s) => add(acc, s.yourNet), zero('INR'))
  const sameCurrency = summaries.every((s) => s.group.currency === 'INR')

  const submit = () => {
    const names = others
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    const memberIds = [state.meId, ...names.map((n) => addPerson(n).id)]
    const group = createGroup(name, currency, memberIds)
    setCreating(false)
    setName('')
    setOthers('')
    router.push(`/app/g/${group.id}`)
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            {me?.name ?? 'You'}
          </p>
          <h1 className="mt-1 font-display text-3xl tracking-[-0.03em]">Your groups</h1>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          New group
        </Button>
      </div>

      {summaries.length > 0 && sameCurrency && (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-rule bg-paper-raised px-6 py-8">
          <AnimatedAmount value={overall} className="!text-5xl" />
          <p className="mt-2 text-sm text-muted">
            {overall.minor < 0n
              ? 'you owe, across every group'
              : overall.minor > 0n
                ? 'owed to you, across every group'
                : 'everything is square'}
          </p>
        </div>
      )}

      <ul className="mt-8 space-y-3">
        {summaries.map(({ group, members, expenseCount, yourNet }) => (
          <li key={group.id}>
            <Link
              href={`/app/g/${group.id}`}
              className="flex items-center gap-4 rounded-2xl border border-rule bg-paper-raised px-5 py-4 transition-colors hover:border-ink"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{group.name}</p>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {members.length} {members.length === 1 ? 'person' : 'people'} ·{' '}
                  {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={
                    yourNet.minor < 0n
                      ? 'text-neg'
                      : yourNet.minor > 0n
                        ? 'text-pos'
                        : 'text-muted'
                  }
                >
                  {formatMoney(yourNet)}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {yourNet.minor < 0n
                    ? 'you owe'
                    : yourNet.minor > 0n
                      ? 'you get'
                      : 'settled'}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {summaries.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-rule px-6 py-14 text-center">
          <p className="font-display text-2xl tracking-[-0.02em]">No groups yet</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
            A group is a trip, a flat, or a set of people you keep spending with. Add one
            and start putting bills in it.
          </p>
          <Button variant="primary" className="mt-7" onClick={() => setCreating(true)}>
            Create your first group
          </Button>
        </div>
      )}

      <section className="mt-12 rounded-2xl border border-rule px-5 py-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          This device
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={me?.name ?? 'You'} />
          <input
            className={inputClass}
            value={me?.name ?? ''}
            onChange={(event) => setMyName(event.target.value)}
            aria-label="Your name"
            placeholder="Your name"
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Everything is stored on this device only — no account, no server, nothing leaves.
          Accounts and sync are next.
        </p>
      </section>

      <Sheet
        open={creating}
        onOpenChange={setCreating}
        title="New group"
        description="Name it after the trip, the flat, or the people."
        footer={
          <Button
            variant="primary"
            className="w-full"
            onClick={submit}
            disabled={!name.trim()}
          >
            Create group
          </Button>
        }
      >
        <div className="space-y-5">
          <Field label="Group name">
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Goa trip"
              autoFocus
            />
          </Field>

          <Field
            label="Who else is in it"
            hint="Separate names with commas. No email or phone needed — you can add UPI IDs later."
          >
            <input
              className={inputClass}
              value={others}
              onChange={(event) => setOthers(event.target.value)}
              placeholder="Priya, Rahul, Aman"
            />
          </Field>

          <Field
            label="Currency"
            hint="Balances for this group are carried in this currency."
          >
            <SegmentedControl
              value={currency}
              onChange={setCurrency}
              options={SUPPORTED_CURRENCIES.slice(0, 6).map((code) => ({
                value: code,
                label: code,
              }))}
            />
          </Field>
        </div>
      </Sheet>
    </>
  )
}
