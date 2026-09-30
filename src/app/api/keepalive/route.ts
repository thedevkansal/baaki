import { NextResponse, type NextRequest } from 'next/server'
import { getDb, isDatabaseConfigured } from '@/db/client'
import { groups } from '@/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Keep the database awake.
 *
 * Supabase pauses a free project after a week with no activity, and a paused
 * project takes every page down with it. Vercel's cron calls this once a day
 * with one real read against a real table, which is activity by any measure.
 *
 * When CRON_SECRET is set, Vercel sends it as a bearer token and nothing else
 * gets in. The response says only whether the read worked.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: 'no database' }, { status: 503 })
  }

  try {
    await getDb().select({ id: groups.id }).from(groups).limit(1)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
