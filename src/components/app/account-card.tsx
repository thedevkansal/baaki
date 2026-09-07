'use client'

import { useEffect, useState } from 'react'
import { currentAccount, type Account } from '@/lib/auth/actions'

/**
 * Where your data is, in one line.
 *
 * Signing in is optional and stays optional, so this is a note and not a pitch:
 * the button lives in the header on every page, and a second call to action
 * here made the groups screen argue with somebody who had not asked anything.
 */
export function AccountCard() {
  const [account, setAccount] = useState<Account | null>(null)

  useEffect(() => {
    let live = true
    currentAccount().then((result) => {
      if (live) setAccount(result)
    })
    return () => {
      live = false
    }
  }, [])

  if (!account) return null

  /**
   * One line, not a pitch.
   *
   * The button is in the header on every page, and the reason to press it is
   * one sentence long. Repeating it here as a second call to action made the
   * groups screen argue with somebody who had not asked a question.
   */
  return (
    <p className="mt-6 text-xs leading-relaxed text-muted">
      {account.signedIn
        ? `Signed in. Your groups follow this account onto any device.`
        : 'Your groups live in this browser. Nothing to sign in to, unless you want them on another device or back after clearing your data.'}
    </p>
  )
}
