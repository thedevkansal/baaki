'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAppState } from '@/lib/store/use-store'

/**
 * What people have asked you to do.
 *
 * Deliberately not a notification feed. Everything here is a specific missing
 * thing with one place to go and fix it, and each one disappears by being done
 * rather than by being dismissed, so the count is always a number of real jobs
 * and never a badge to clear.
 */
export function NudgeBell() {
  const nudges = useAppState().nudges ?? []
  const [open, setOpen] = useState(false)

  if (nudges.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={`${nudges.length} ${nudges.length === 1 ? 'thing' : 'things'} to do`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-rule transition-colors hover:border-ink"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neg px-1 font-mono text-[10px] leading-none text-paper">
          {nudges.length}
        </span>
      </button>

      {open && (
        <>
          {/* Clicking anywhere else puts it away, without trapping focus. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-rule bg-paper-raised p-2 shadow-lg">
            <ul className="space-y-1">
              {nudges.map((nudge) => (
                <li key={nudge.id}>
                  <Link
                    href={`/app/g/${nudge.groupId}`}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3 transition-colors hover:bg-paper-sunken"
                  >
                    <p className="text-sm leading-relaxed">
                      <span className="font-medium">{nudge.fromName}</span> asked you to
                      add your UPI ID so they can pay you back.
                    </p>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                      {nudge.groupName}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
