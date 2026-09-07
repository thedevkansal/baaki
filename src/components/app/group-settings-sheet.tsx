'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, inputClass } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { buildGroupCsv, csvFilename, describeExport } from '@/lib/export'
import { deleteGroup, updateGroup } from '@/lib/store/store'
import type { Expense, Group, Person, Settlement } from '@/lib/store/types'

export function GroupSettingsSheet({
  open,
  onOpenChange,
  group,
  expenseCount,
  members,
  expenses,
  settlements,
  nameOf,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  expenseCount: number
  members: Person[]
  expenses: Expense[]
  settlements: Settlement[]
  nameOf: (personId: string) => string
}) {
  const router = useRouter()
  const [name, setName] = useState(group.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const confirmedSettlements = settlements.filter((s) => s.status === 'confirmed').length

  /**
   * The name is the only thing here that waits for the footer. Everything else
   * on this sheet takes effect on the spot, so a footer that sits disabled
   * whenever the name is untouched reads as a broken button rather than as
   * nothing-to-save. It closes the sheet instead, and says which it is doing.
   */
  const renamed = name.trim() !== '' && name.trim() !== group.name

  const download = () => {
    const csv = buildGroupCsv({
      groupName: group.name,
      currency: group.currency,
      members,
      expenses,
      settlements,
      nameOf,
    })
    // A BOM so Excel opens rupee symbols and names in other scripts correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = csvFilename(group.name)
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Group settings"
      footer={
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            if (renamed) updateGroup(group.id, { name: name.trim() })
            onOpenChange(false)
          }}
        >
          {renamed ? 'Save changes' : 'Done'}
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
            Export
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {expenseCount === 0
              ? 'Nothing to export yet.'
              : `A spreadsheet with a column per person: ${describeExport(expenseCount, confirmedSettlements)}.`}
          </p>
          <Button
            size="sm"
            className="mt-4"
            disabled={expenseCount === 0}
            onClick={download}
          >
            Download CSV
          </Button>
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
