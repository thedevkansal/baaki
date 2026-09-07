'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, inputClass } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { money } from '@/lib/money'
import { parseSplitwiseCsv, type ImportResult } from '@/lib/import-splitwise'
import { importGroup } from '@/lib/store/store'

/**
 * Bring a group over from Splitwise.
 *
 * Their export is per group, so this is per group too. Nothing is written
 * until the file has been read and what it contains has been shown, because
 * an import that silently guesses is worse than one that asks.
 */
export function ImportSheet({
  open,
  onOpenChange,
  myName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  myName: string
}) {
  const router = useRouter()
  const [parsed, setParsed] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [meName, setMeName] = useState('')

  const read = async (file: File) => {
    setError(null)
    try {
      const result = parseSplitwiseCsv(await file.text())
      setParsed(result)
      setGroupName(
        file.name
          .replace(/\.csv$/i, '')
          .replace(/[_-]+/g, ' ')
          .trim(),
      )
      // Splitwise writes first names, so match on one if we can.
      const mine = result.people.find(
        (name) => name.toLowerCase() === myName.trim().toLowerCase(),
      )
      setMeName(mine ?? result.people[0])
    } catch (cause) {
      setParsed(null)
      setError(cause instanceof Error ? cause.message : 'That file could not be read.')
    }
  }

  const total = parsed ? parsed.rows.reduce((acc, row) => acc + row.cost.minor, 0n) : 0n

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Import from Splitwise"
      description="Open a group there, Settings, Export as spreadsheet, then pick the file here."
      footer={
        parsed ? (
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              const group = importGroup({
                name: groupName,
                currency: parsed.currency,
                people: parsed.people,
                meName,
                rows: parsed.rows,
              })
              onOpenChange(false)
              router.push(`/app/g/${group.id}`)
            }}
          >
            Import {parsed.rows.length} {parsed.rows.length === 1 ? 'bill' : 'bills'}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <Field label="The exported file" error={error ?? undefined}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void read(file)
            }}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border file:border-rule file:bg-paper file:px-4 file:py-2 file:text-sm file:text-ink hover:file:border-ink"
          />
        </Field>

        {parsed && (
          <>
            <div className="rounded-2xl border border-rule bg-paper-raised px-5 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                Found
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                {parsed.rows.length} {parsed.rows.length === 1 ? 'bill' : 'bills'} worth{' '}
                <span className="font-mono">
                  {formatMoney(money(total, parsed.currency))}
                </span>
                , between {parsed.people.join(', ')}.
              </p>
            </div>

            <Field label="Group name">
              <input
                className={inputClass}
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Goa trip"
              />
            </Field>

            <Field
              label="Which one is you"
              hint="Your existing history stays attached to you rather than to a copy."
            >
              <select
                className={inputClass}
                value={meName}
                onChange={(event) => setMeName(event.target.value)}
              >
                {parsed.people.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>

            {parsed.warnings.length > 0 && (
              <ul className="space-y-2 rounded-xl border border-rule px-4 py-3">
                {parsed.warnings.map((warning) => (
                  <li key={warning} className="text-xs leading-relaxed text-muted">
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs leading-relaxed text-muted">
              Every balance comes across exactly. Their export records what each person came
              out by on a bill rather than how it was divided, so an even split is recovered
              as one and anything else is reconstructed to the same balances.
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}
