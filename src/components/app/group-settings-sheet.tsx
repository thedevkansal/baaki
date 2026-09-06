'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, inputClass } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { deleteGroup, updateGroup } from '@/lib/store/store'
import type { Group } from '@/lib/store/types'

export function GroupSettingsSheet({
  open,
  onOpenChange,
  group,
  expenseCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  expenseCount: number
}) {
  const router = useRouter()
  const [name, setName] = useState(group.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Group settings"
      footer={
        <Button
          variant="primary"
          className="w-full"
          disabled={!name.trim() || name.trim() === group.name}
          onClick={() => {
            updateGroup(group.id, { name: name.trim() })
            onOpenChange(false)
          }}
        >
          Save changes
        </Button>
      }
    >
      <div className="space-y-7">
        <Field label="Group name">
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Simplify debts
          </span>
          <button
            type="button"
            onClick={() => updateGroup(group.id, { simplify: !group.simplify })}
            aria-pressed={group.simplify}
            className="mt-2 flex w-full items-center justify-between gap-4 rounded-xl border border-rule px-4 py-3 text-left transition-colors hover:border-ink"
          >
            <span className="min-w-0 text-sm leading-relaxed text-muted">
              Collapse the group into the fewest payments. Every simplified debt still shows
              the original bills it stands for.
            </span>
            <span
              className={`h-6 w-10 shrink-0 rounded-full border transition-colors ${
                group.simplify ? 'border-pos bg-pos' : 'border-rule bg-paper-sunken'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-paper transition-transform ${
                  group.simplify ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        </div>

        <div className="rounded-xl border border-rule px-4 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Delete this group
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {expenseCount === 0
              ? 'Nothing has been added to it yet.'
              : `Removes ${expenseCount} ${expenseCount === 1 ? 'bill' : 'bills'} and every balance in it. This cannot be undone.`}
          </p>

          {confirmingDelete ? (
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
              <Button
                size="sm"
                variant="danger"
                className="flex-1"
                onClick={() => {
                  deleteGroup(group.id)
                  onOpenChange(false)
                  router.push('/app')
                }}
              >
                Delete for good
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="danger"
              className="mt-4"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete group
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
