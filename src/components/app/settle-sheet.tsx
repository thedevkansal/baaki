'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Field, inputClass } from '@/components/ui/field'
import { QrCode } from '@/components/ui/qr-code'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import type { Money } from '@/lib/money'
import { detectPlatform, isValidVpa, settleRoute } from '@/lib/upi/link'
import { proposeSettlement, setPersonVpa } from '@/lib/store/store'
import type { Person } from '@/lib/store/types'

export function SettleSheet({
  open,
  onOpenChange,
  groupId,
  groupName,
  from,
  to,
  amount,
  shared,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
  from: Person
  to: Person
  amount: Money
  /** In a shared group a UPI ID is its owner's to set, and nobody else's. */
  shared: boolean
}) {
  /**
   * Their UPI ID, which in a shared group is theirs and is never typed here.
   *
   * A VPA entered by anybody but its owner is a payment to a stranger waiting
   * to happen, and there is nobody to catch it: the app cannot see the payment,
   * so a wrong one just silently goes somewhere else. On a group that is still
   * only on this device there is no "them" to have set it, so it stays typable.
   */
  const theirs = to.vpa ?? ''
  const [typed, setTyped] = useState(theirs)
  const vpa = shared ? theirs : typed
  const [copied, setCopied] = useState(false)
  const platform = usePlatform()

  const route = useMemo(() => {
    if (!isValidVpa(vpa) || amount.currency !== 'INR' || amount.minor <= 0n) return null
    return settleRoute(
      { vpa, payeeName: to.name, amount, note: `Baaki ${groupName}` },
      platform,
    )
  }, [vpa, amount, to.name, groupName, platform])

  const record = (method: 'upi' | 'cash' | 'other') => {
    if (!shared && isValidVpa(vpa) && vpa !== to.vpa) setPersonVpa(to.id, vpa)
    proposeSettlement({
      groupId,
      fromId: from.id,
      toId: to.id,
      minor: amount.minor,
      method,
    })
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Pay ${to.name}`}
      description="Baaki cannot see the payment itself, so this records that you paid and asks them to confirm."
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => record('cash')}>
            Paid in cash
          </Button>
          <Button variant="primary" className="flex-[2]" onClick={() => record('upi')}>
            I paid {formatMoney(amount)}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-rule bg-paper-raised px-5 py-6 text-center">
          <p className="text-sm text-muted">You owe {to.name}</p>
          <p className="mt-1 font-display text-5xl leading-none tracking-[-0.03em] text-neg">
            {formatMoney(amount)}
          </p>
        </div>

        {shared ? (
          isValidVpa(theirs) ? (
            <div className="rounded-xl border border-rule bg-paper-raised px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                Paying
              </p>
              <p className="mt-1 font-mono text-sm">{theirs}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {to.name} set this themselves. Nobody else can.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-rule px-4 py-4">
              <p className="text-sm leading-relaxed">
                {to.name} has not added a UPI ID yet, so there is nothing to open a
                payment app with.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Ask them to add it in Baaki. Typing it for them is how money reaches
                the wrong person, and Baaki cannot see the payment to catch it. You can
                still pay them any other way and record it below.
              </p>
            </div>
          )
        ) : (
          <Field
            label={`${to.name}'s UPI ID`}
            hint="This group is only on this device, so you are keeping their details. Once they join, it is theirs to set."
            error={
              typed.trim() !== '' && !isValidVpa(typed)
                ? 'That is not a valid UPI ID.'
                : undefined
            }
          >
            <input
              className={cn(inputClass, 'font-mono')}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="priya@okhdfcbank"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
        )}

        {amount.currency !== 'INR' && (
          <p className="text-sm text-muted">
            UPI settles in rupees only, so record this one as cash or a bank transfer.
          </p>
        )}

        {route && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              {route.kind === 'intent'
                ? 'Open your UPI app'
                : route.kind === 'app-picker'
                  ? 'Pay with'
                  : 'Scan from your phone'}
            </p>

            {route.kind === 'qr' ? (
              <div className="mt-3 flex flex-col items-center gap-4 rounded-2xl border border-rule bg-paper-raised p-5 sm:flex-row sm:items-start">
                <div className="w-40 shrink-0 rounded-xl border border-rule p-2 text-ink">
                  <QrCode
                    value={route.links[0].href}
                    title={`UPI QR to pay ${to.name} ${formatMoney(amount)}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-muted">
                    There is no UPI app on a desktop. Scan this with your phone and the
                    payee, amount and note arrive already filled in.
                  </p>
                  <p className="mt-3 font-mono text-sm break-all text-ink">
                    {route.copyVpa}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {route.links.map((link) => (
                  <a
                    key={link.app}
                    href={link.href}
                    className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(route.copyVpa)
                setCopied(true)
              }}
              className="mt-3 text-xs text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {copied ? 'UPI ID copied' : 'Copy the UPI ID instead'}
            </button>
          </div>
        )}

        <p className="text-xs leading-relaxed text-muted">
          Nothing moves until {to.name} confirms. Until then it shows as pending for both of
          you.
        </p>
      </div>
    </Sheet>
  )
}

/**
 * Which kind of device this is. The server cannot know, so it assumes the
 * desktop route and the client corrects it on hydration - which is exactly what
 * useSyncExternalStore is for.
 */
const noopSubscribe = () => () => {}

function usePlatform() {
  return useSyncExternalStore(
    noopSubscribe,
    () => detectPlatform(navigator.userAgent),
    () => 'other' as const,
  )
}
