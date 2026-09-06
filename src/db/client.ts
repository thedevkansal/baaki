import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import type { Db } from './queries'

/**
 * The production connection.
 *
 * Kept behind a getter rather than created at import time so the app still
 * builds and runs with no database configured, which is the state it is in
 * until someone provisions one. `isDatabaseConfigured` is what the app checks
 * before offering anything that needs a server.
 */
let cached: Db | null = null

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export function getDb(): Db {
  if (cached) return cached

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.',
    )
  }

  // `prepare: false` is required for transaction pooling, which is how Supabase
  // and most managed Postgres front their connections.
  const client = postgres(url, { prepare: false })
  cached = drizzle(client, { schema }) as unknown as Db
  return cached
}
