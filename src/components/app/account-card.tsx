'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabaseBrowser } from '@/lib/auth/client'
import { currentAccount, signOut, type Account } from '@/lib/auth/actions'

/**
 * The difference between having an account and not, said plainly.
 *
 * Signing in is optional and stays optional: you can make groups, join by link,
 * split and settle without one, which is the reason the first run feels better
 * than the alternative. So this cannot be a wall, and it cannot be vague either
 * -- there is exactly one consequence that matters, and somebody who has not
 * been told it only finds out on the day their browser data goes.
 */
export function AccountCard() {
  const [account, setAccount] = useState<Account | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    currentAccount().then((result) => {
      if (live) setAccount(result)
    })
    return () => {
      live = false
    }
  }, [])

  const signIn = async () => {
    setBusy(true)
    const supabase = supabaseBrowser()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/app` },
    })
    if (error) setBusy(false)
  }

  if (!account) return null

  if (account.signedIn) {
    return (
      <section className="mt-6 rounded-2xl border border-rule px-5 py-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Your account
        </p>
        <p className="mt-3 text-sm">
          Signed in as <span className="font-medium">{account.email ?? account.name}</span>.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {account.seats === 0
            ? 'Nothing is attached to it yet. Any group you share or join from now on will be.'
            : `${account.seats} ${account.seats === 1 ? 'group is' : 'groups are'} attached to it. Sign in on another phone and they come with you.`}
        </p>
        <form action={signOut}>
          <Button size="sm" variant="ghost" className="mt-3 px-0">
            Sign out
          </Button>
        </form>
      </section>
    )
  }

  return (
    <section className="mt-6 rounded-2xl border border-rule px-5 py-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        Keep this if you lose your phone
      </p>
      <p className="mt-3 text-sm leading-relaxed">
        Everything here lives in this browser. Clear its data and the groups that are
        only on this device are gone, and shared ones stop recognising you.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        An account fixes only that. It is not needed to use Baaki, to join a group, or to
        be paid, and nothing is shared with Google beyond your email address.
      </p>
      <Button variant="primary" size="sm" className="mt-4" disabled={busy} onClick={signIn}>
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </Button>
    </section>
  )
}
