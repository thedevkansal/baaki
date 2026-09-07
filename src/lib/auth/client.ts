'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * The browser's view of the session.
 *
 * Only ever used to start a sign-in and to read who is signed in. Nothing in
 * the ledger is read or written through it: money goes through server actions
 * that check identity themselves, because a client that can be edited is not
 * an authority on who you are.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export const isAuthConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)
