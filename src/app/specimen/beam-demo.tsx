'use client'

import { useState } from 'react'
import { BalanceBeam, type BeamSegment } from '@/components/beam/balance-beam'
import { fromMajor, money } from '@/lib/money'

const INR = 'INR'

const START: BeamSegment[] = [
  { id: 'goa', label: 'Goa Trip', amount: fromMajor('-340', INR) },
  { id: 'flat', label: 'Flat 402', amount: fromMajor('1280', INR) },
  { id: 'lunch', label: 'Lunch crew', amount: fromMajor('-95', INR) },
]

export function BeamDemo() {
  const [segments, setSegments] = useState(START)
  const [selected, setSelected] = useState<string | null>(null)

  const settleAll = () =>
    setSegments((current) => current.map((s) => ({ ...s, amount: money(0n, INR) })))

  const reset = () => setSegments(START)

  const addExpense = () =>
    setSegments((current) =>
      current.map((s) =>
        s.id === 'goa'
          ? { ...s, amount: fromMajor('-1240', INR) }
          : s.id === 'lunch'
            ? { ...s, amount: fromMajor('-420', INR) }
            : s,
      ),
    )

  return (
    <div>
      <BalanceBeam
        segments={segments}
        currency={INR}
        selectedId={selected}
        onSelect={setSelected}
      />

      <div className="mt-8 flex flex-wrap gap-2">
        {[
          ['Add a big hotel bill', addExpense],
          ['Settle everything', settleAll],
          ['Reset', reset],
        ].map(([label, action]) => (
          <button
            key={label as string}
            type="button"
            onClick={action as () => void}
            className="rounded-full border border-rule px-4 py-2 text-sm transition-colors hover:bg-paper-sunken"
          >
            {label as string}
          </button>
        ))}
      </div>

      {selected && (
        <p className="mt-4 text-sm text-muted">
          Selected: {segments.find((s) => s.id === selected)?.label}
        </p>
      )}
    </div>
  )
}
