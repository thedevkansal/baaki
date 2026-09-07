'use client'

import { useCallback, useRef, useState } from 'react'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useDismiss } from '@/lib/use-dismiss'
import { supabaseBrowser } from '@/lib/auth/client'
import { currentAccount, signOut, type Account } from '@/lib/auth/actions'

/**
 * Signing in, where people look for it.
 *
 * It was at the bottom of one inner page, which is where you put a thing you
 * would rather nobody did. Signing in is optional here and that is a real
 * promise, but optional is not the same as hidden: somebody who wants their
 * groups to survive a new phone should not have to go hunting for the way.
 */
export function AuthButton() {
  const [account, setAccount] = useState<Account | null>(null)
  const [busy, setBusy] = useState(false)
  const pathname = usePathname()
  /**
   * The menu is open *for a page*, not open in general.
   *
   * A menu that outlives the page it was opened on reads as something stuck to
   * the screen rather than something you opened. Keying it to the path closes
   * it on navigation without an effect that writes state during a render.
   */
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor === pathname
  const setOpen = (next: boolean) => setOpenFor(next ? pathname : null)

  const shell = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpenFor(null), [])
  useDismiss(shell, open, close)

  useEffect(() => {
    let live = true
    currentAccount().then((result) => {
      if (live) setAccount(result)
    })
    return () => {
      live = false
    }
  }, [])

  // Nothing at all until we know, rather than a button that changes under a
  // cursor already moving towards it.
  if (!account) return null

  if (!account.signedIn) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const { error } = await supabaseBrowser().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback?next=/app` },
          })
          if (error) setBusy(false)
        }}
        className="whitespace-nowrap rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-paper-sunken hover:text-ink disabled:opacity-60"
      >
        {busy ? 'Opening Google…' : 'Sign in'}
      </button>
    )
  }

  const initial = (account.email ?? account.name ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="relative" ref={shell}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Signed in as ${account.email ?? account.name}`}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-rule text-sm font-medium transition-colors hover:border-ink"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-rule bg-paper-raised p-4 shadow-lg">
          <p className="truncate text-sm font-medium">{account.email ?? account.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {account.seats === 0
              ? 'No groups attached yet.'
              : `${account.seats} ${account.seats === 1 ? 'group' : 'groups'} follow this account.`}
          </p>
          <form action={signOut} className="mt-4">
            {/* The one action here that undoes something, coloured like it. */}
            <Button size="sm" variant="danger" className="w-full" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
