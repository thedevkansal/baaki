import 'dotenv/config'
import { config } from 'dotenv'
import type { Config } from 'drizzle-kit'

// .env.local is the file people actually fill in; dotenv/config only reads .env.
config({ path: '.env.local', override: true })

/**
 * Migrations run against the session pooler rather than the transaction one.
 * Transaction pooling hands back a different backend between statements, which
 * is fine for queries and wrong for DDL, advisory locks and the deferred
 * constraint trigger this schema installs.
 */
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
} satisfies Config
