'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ImportSheet } from '@/components/app/import-sheet'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { Avatar, Field, inputClass } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { isValidVpa } from '@/lib/upi/link'
import { add, zero } from '@/lib/money'
import { SUPPORTED_CURRENCIES } from '@/lib/fx'
import {
  addPerson,
  createGroup,
  seedSampleGroup,
  setMyName,
  setPersonVpa,
} from '@/lib/store/store'
import { useAppState, useGroupSummaries } from '@/lib/store/use-store'

export default function GroupsPage() {
  const router = useRouter()
  const state = useAppState()
  const summaries = useGroupSummaries()

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [others, setOthers] = useState('')
  /**
   * null means untouched, so the field shows what is stored without needing an
   * effect to copy it in and without going stale when a pull changes it.
   */
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [vpaDraft, setVpaDraft] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const me = state.people.find((p) => p.id === state.meId)
  // "You" is the placeholder a fresh device starts with, not a name somebody
  // chose. Anything that puts a name in front of other people asks for a real
  // one first.
  const unnamed = !me?.name || me.name === 'You'
  const storedName = unnamed ? '' : (me?.name ?? '')
  const storedVpa = me?.vpa ?? ''
  const myName = nameDraft ?? storedName
  const myVpa = vpaDraft ?? storedVpa
  const myVpaLooksWrong = myVpa.trim() !== '' && !isValidVpa(myVpa.trim())
  const profileDirty = myName.trim() !== storedName || myVpa.trim() !== storedVpa
  const overall = summaries.reduce((acc, s) => add(acc, s.yourNet), zero('INR'))
  const sameCurrency = summaries.every((s) => s.group.currency === 'INR')

  const submit = () => {
    if (myName.trim()) setMyName(myName.trim())
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
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setImporting(true)}>
            Import
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            New group
          </Button>
        </div>
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
        {summaries.map(({ group, members, expenseCount, yourNet }, index) => (
          <li key={group.id} className="rise" style={{ animationDelay: `${index * 60}ms` }}>
            <Link
              href={`/app/g/${group.id}`}
              className="flex items-center gap-4 rounded-2xl border border-rule bg-paper-raised px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-ink hover:shadow-[0_6px_20px_-12px_var(--ink)]"
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
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create your first group
            </Button>
            <Button onClick={() => router.push(`/app/g/${seedSampleGroup().id}`)}>
              Try a sample trip
            </Button>
            <Button onClick={() => setImporting(true)}>Import from Splitwise</Button>
          </div>
          <p className="mt-4 text-xs text-muted">
            The sample is a real group with real bills. Delete it whenever you like.
          </p>
        </div>
      )}

      <section className="mt-12 rounded-2xl border border-rule px-5 py-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          You
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={me?.name ?? 'You'} />
          <input
            className={inputClass}
            value={myName}
            onChange={(event) => setNameDraft(event.target.value)}
            aria-label="Your name"
            placeholder="Your name"
          />
        </div>
        <input
          className={`${inputClass} mt-2 font-mono`}
          value={myVpa}
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => setVpaDraft(event.target.value)}
          aria-label="Your UPI ID"
          placeholder="Your UPI ID, so people can pay you"
        />
        {myVpaLooksWrong && (
          <p className="mt-2 text-xs text-neg">
            That does not look like a UPI ID. Example: dev@okhdfcbank
          </p>
        )}
        <Button
          size="sm"
          className="mt-3"
          disabled={!profileDirty || !myName.trim() || myVpaLooksWrong}
          onClick={() => {
            if (myName.trim() !== me?.name) setMyName(myName)
            if (me && myVpa.trim() !== storedVpa) setPersonVpa(me.id, myVpa)
            setNameDraft(null)
            setVpaDraft(null)
          }}
        >
          {profileDirty ? 'Save' : 'Saved'}
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          A group stays on this device until you share it. Once you do, everyone in it
          keeps their own copy and balances stay in step.
        </p>
      </section>

      {importing && (
        <ImportSheet open onOpenChange={setImporting} myName={me?.name ?? 'You'} />
      )}

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
            disabled={!name.trim() || (unnamed && !myName.trim())}
          >
            Create group
          </Button>
        }
      >
        <div className="space-y-5">
          {unnamed && (
            <Field
              label="Your name"
              hint="It is what everybody else in the group sees beside the money."
            >
              <input
                className={inputClass}
                value={myName}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Dev"
                autoFocus
              />
            </Field>
          )}

          <Field label="Group name">
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Goa trip"
              autoFocus={!unnamed}
            />
          </Field>

          <Field
            label="Who else is in it"
            hint="Optional. Leave it empty and send them the group link instead: whoever opens it puts in their own name and UPI ID."
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
            hint="Balances for this group are carried in this currency. A single bill can still be spent in another one."
          >
            <select
              className={inputClass}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code === 'INR' ? 'INR, Indian rupee' : code}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Sheet>
    </>
  )
}
