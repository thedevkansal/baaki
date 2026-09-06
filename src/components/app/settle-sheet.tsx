'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Field, inputClass } from '@/components/ui/field'
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
  from: Person
  to: Person
  amount: Money
}) {
  // Mounted only while open, so this starts from whatever we know about them.
  const [vpa, setVpa] = useState(to.vpa ?? '')
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
    if (isValidVpa(vpa) && vpa !== to.vpa) setPersonVpa(to.id, vpa)
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

        <Field
          label={`${to.name}'s UPI ID`}
          hint="Saved for next time. It never leaves this device."
          error={
            vpa.trim() !== '' && !isValidVpa(vpa)
              ? 'That is not a valid UPI ID.'
              : undefined
          }
        >
          <input
            className={cn(inputClass, 'font-mono')}
            value={vpa}
            onChange={(event) => setVpa(event.target.value)}
            placeholder="priya@okhdfcbank"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>

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
              <div className="mt-3 rounded-2xl border border-rule bg-paper-raised p-5">
                <p className="text-sm leading-relaxed text-muted">
                  There is no UPI app on a desktop. Open Baaki on your phone, or pay{' '}
                  <span className="font-mono text-ink">{route.copyVpa}</span> directly.
                </p>
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
