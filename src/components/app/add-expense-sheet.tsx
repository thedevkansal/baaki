'use client'

import { useMemo, useState } from 'react'
import { Avatar, Field, SegmentedControl, inputClass } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { FALLBACK_RATES_TO_INR, SUPPORTED_CURRENCIES, convertMoney } from '@/lib/fx'
import { fromMajor, money, sum, toMajorString, zero, type Money } from '@/lib/money'
import { SPLIT_MODES, buildShares, evaluateAmount, type SplitMode } from '@/lib/split'
import { addExpense } from '@/lib/store/store'
import { CATEGORIES, type Person } from '@/lib/store/types'

export function AddExpenseSheet({
  open,
  onOpenChange,
  groupId,
  currency,
  members,
  defaultPayerId,
  splitSeed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  currency: string
  members: Person[]
  defaultPayerId: string
  /**
   * Rotates which person absorbs the odd paisa. The group's expense count is
   * used, so the preview stays put while you type instead of reshuffling.
   */
  splitSeed: number
}) {
  // The sheet is mounted only while it is open, so every field starts fresh
  // and there is no effect copying props into state.
  const [description, setDescription] = useState('')
  const [amountText, setAmountText] = useState('')
  const [category, setCategory] = useState<string>('General')
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10))

  const [spentCurrency, setSpentCurrency] = useState(currency)
  const [rate, setRate] = useState('1')

  const [multiPayer, setMultiPayer] = useState(false)
  const [payerId, setPayerId] = useState(defaultPayerId)
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({})

  const [mode, setMode] = useState<SplitMode>('equal')
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(members.map((m) => [m.id, true])),
  )
  const [splitValues, setSplitValues] = useState<Record<string, string>>({})

  const spent = evaluateAmount(amountText, spentCurrency)
  const isForeign = spentCurrency !== currency

  const total: Money | null = useMemo(() => {
    if (!spent) return null
    if (!isForeign) return spent
    try {
      return convertMoney(spent, currency, rate)
    } catch {
      return null
    }
  }, [spent, isForeign, currency, rate])

  const split = useMemo(() => {
    if (!total) return null
    return buildShares(
      total,
      mode,
      members.map((m) => ({
        ref: m.id,
        selected: included[m.id] ?? false,
        value: splitValues[m.id],
      })),
      splitSeed,
    )
  }, [total, mode, members, included, splitValues, splitSeed])

  const payers = useMemo(() => {
    if (!total) return []
    if (!multiPayer) return [{ personId: payerId, minor: total.minor }]
    return members
      .map((m) => {
        const typed = payerAmounts[m.id]?.trim()
        if (!typed) return null
        try {
          return { personId: m.id, minor: fromMajor(typed, currency).minor }
        } catch {
          return null
        }
      })
      .filter((p): p is { personId: string; minor: bigint } => p !== null && p.minor > 0n)
  }, [total, multiPayer, payerId, payerAmounts, members, currency])

  const paidTotal = payers.reduce((acc, p) => acc + p.minor, 0n)
  const payerError =
    total && multiPayer && paidTotal !== total.minor
      ? `Payers add up to ${formatMoney(money(paidTotal, currency))}, not ${formatMoney(total)}.`
      : undefined

  const canSave = Boolean(total && total.minor > 0n && split && !split.error && !payerError)

  const save = () => {
    if (!total || !split || split.error || payerError) return
    addExpense({
      groupId,
      description,
      category,
      occurredOn,
      splitMode: mode,
      payers,
      shares: split.shares.map((s) => ({ personId: s.ref, minor: s.amount.minor })),
      original:
        isForeign && spent
          ? { currency: spentCurrency, minor: spent.minor, rateToGroupCurrency: rate }
          : undefined,
    })
    onOpenChange(false)
  }

  const setCurrencyAndRate = (code: string) => {
    setSpentCurrency(code)
    if (code === currency) {
      setRate('1')
      return
    }
    // Only meaningful when the group is in rupees; otherwise the user types it.
    const guess = currency === 'INR' ? (FALLBACK_RATES_TO_INR[code] ?? '') : ''
    setRate(guess)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add an expense"
      footer={
        <Button variant="primary" className="w-full" onClick={save} disabled={!canSave}>
          {total ? `Add ${formatMoney(total)}` : 'Add expense'}
        </Button>
      }
    >
      <div className="space-y-6">
        <Field label="What was it for">
          <input
            className={inputClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Dinner at Sagar"
            autoFocus
          />
        </Field>

        <Field
          label="Amount"
          hint={
            spent && amountText.trim() !== toMajorString(spent)
              ? `= ${formatMoney(spent)}`
              : 'Type the maths if you like. 450+120*2 works.'
          }
          error={amountText.trim() !== '' && !spent ? 'That is not an amount.' : undefined}
        >
          <div className="flex gap-2">
            <input
              className={cn(inputClass, 'font-mono')}
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              placeholder="450+120*2"
              inputMode="text"
            />
            <select
              className={cn(inputClass, 'w-24 shrink-0')}
              value={spentCurrency}
              onChange={(event) => setCurrencyAndRate(event.target.value)}
              aria-label="Currency spent in"
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </Field>

        {isForeign && (
          <Field
            label={`Rate: 1 ${spentCurrency} in ${currency}`}
            hint={
              total
                ? `${formatMoney(spent!)} becomes ${formatMoney(total)} in this group.`
                : 'Enter the rate you actually got. It is saved with the expense and never re-applied later.'
            }
            error={!total && spent ? 'That rate is not a number.' : undefined}
          >
            <input
              className={cn(inputClass, 'font-mono')}
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              placeholder="88"
              inputMode="decimal"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select
              className={inputClass}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              className={inputClass}
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </Field>
        </div>

        {/* ---------------------------------------------------------- payers */}
        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Paid by
            </span>
            <button
              type="button"
              onClick={() => setMultiPayer((value) => !value)}
              className="text-xs text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {multiPayer ? 'One person paid' : 'More than one person paid'}
            </button>
          </div>

          {!multiPayer ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setPayerId(member.id)}
                  aria-pressed={payerId === member.id}
                  className={cn(
                    'rounded-full border px-3.5 py-2 text-sm transition-colors',
                    payerId === member.id
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule hover:border-ink',
                  )}
                >
                  {member.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <Avatar name={member.name} />
                  <span className="min-w-0 flex-1 truncate text-sm">{member.name}</span>
                  <input
                    className={cn(inputClass, 'w-28 shrink-0 text-right font-mono')}
                    value={payerAmounts[member.id] ?? ''}
                    onChange={(event) =>
                      setPayerAmounts((current) => ({
                        ...current,
                        [member.id]: event.target.value,
                      }))
                    }
                    placeholder="0"
                    inputMode="decimal"
                    aria-label={`Amount paid by ${member.name}`}
                  />
                </div>
              ))}
              {payerError && <p className="text-xs text-neg">{payerError}</p>}
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------- split */}
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Split
          </span>
          <SegmentedControl
            className="mt-3"
            value={mode}
            onChange={setMode}
            options={SPLIT_MODES.map((m) => ({ value: m.value, label: m.label }))}
          />
          <p className="mt-2 text-xs text-muted">
            {SPLIT_MODES.find((m) => m.value === mode)?.hint}
          </p>

          <ul className="mt-4 space-y-2">
            {members.map((member) => {
              const on = included[member.id] ?? false
              const share = split?.shares.find((s) => s.ref === member.id)
              return (
                <li key={member.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setIncluded((current) => ({ ...current, [member.id]: !on }))
                    }
                    aria-pressed={on}
                    aria-label={`${on ? 'Remove' : 'Include'} ${member.name}`}
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                      on
                        ? 'border-ink bg-ink text-paper'
                        : 'border-rule text-muted hover:border-ink',
                    )}
                  >
                    {member.name.slice(0, 1).toUpperCase()}
                  </button>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      !on && 'text-muted line-through',
                    )}
                  >
                    {member.name}
                  </span>

                  {mode !== 'equal' && on && (
                    <input
                      className={cn(inputClass, 'w-24 shrink-0 text-right font-mono')}
                      value={splitValues[member.id] ?? ''}
                      onChange={(event) =>
                        setSplitValues((current) => ({
                          ...current,
                          [member.id]: event.target.value,
                        }))
                      }
                      placeholder={mode === 'shares' ? '1' : '0'}
                      inputMode="decimal"
                      aria-label={`${mode} for ${member.name}`}
                    />
                  )}

                  <span
                    className={cn(
                      'w-24 shrink-0 text-right font-mono text-sm tabular-nums',
                      on ? 'text-ink' : 'text-muted',
                    )}
                  >
                    {share ? formatMoney(share.amount) : formatMoney(zero(currency))}
                  </span>
                </li>
              )
            })}
          </ul>

          {split?.error && <p className="mt-3 text-xs text-neg">{split.error}</p>}

          {total && split && !split.error && (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              adds up to{' '}
              {formatMoney(
                sum(
                  split.shares.map((s) => s.amount),
                  currency,
                ),
              )}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  )
}
