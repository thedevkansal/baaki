import { NextResponse, type NextRequest } from 'next/server'
import { getDb, isDatabaseConfigured } from '@/db/client'
import { existingDeviceId } from '@/lib/auth/device'
import { adoptSeats, ensureUser } from '@/lib/auth/identity'
import { supabaseServer } from '@/lib/auth/server'

/**
 * Where Google sends people back to.
 *
 * The one moment an account and a device meet. Everything the browser already
 * had is attached to the person who just signed in, so signing in never costs
 * anybody the groups they made before they had an account.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/app'

  if (!code) {
    return NextResponse.redirect(new URL('/app?signin=failed', url.origin))
  }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(new URL('/app?signin=failed', url.origin))
  }

  if (isDatabaseConfigured()) {
    const db = getDb()
    const userId = await ensureUser(db, {
      id: data.user.id,
      email: data.user.email,
      name:
        (data.user.user_metadata?.full_name as string | undefined) ??
        (data.user.user_metadata?.name as string | undefined) ??
        null,
    })

    /**
     * Only a device that already exists is adopted. Minting one here would
     * hand a brand new browser a device identity it never used, which is
     * harmless but untrue, and untrue things in an identity system get relied
     * on later.
     */
    const device = await existingDeviceId()
    if (device) await adoptSeats(db, device, userId)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
