import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * The server's view of the session, read from httpOnly cookies.
 *
 * This is the only thing allowed to answer "who is asking". The device cookie
 * that predates accounts still identifies an unsigned browser, but where both
 * exist the account wins: a device is something you hold, an account is
 * something you are.
 */
export async function supabaseServer() {
  const jar = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) jar.set(name, value, options)
          } catch {
            // Called from a render rather than an action or route handler.
            // The session is still refreshed by middleware, so this is safe.
          }
        },
      },
    },
  )
}

/** The signed-in Supabase user, or null. Never trusts anything client-sent. */
export async function currentAuthUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}
