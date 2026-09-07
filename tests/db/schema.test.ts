import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * These run against real Postgres.
 *
 * PGlite is the actual Postgres engine compiled to WASM, running in this
 * process, so the triggers, the deferred constraints and the bigint behaviour
 * below are the ones production will get. No container, no credentials, no
 * "it worked on my machine" gap between the schema and its tests.
 */
let db: PGlite

async function applyMigrations() {
  const dir = path.join(process.cwd(), 'drizzle')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) await db.exec(trimmed)
    }
  }
}

/** A group with four people, returned as their participant ids. */
async function seedGroup() {
  const group = await db.query<{ id: string }>(
    `insert into groups (name, currency) values ('Goa trip', 'INR') returning id`,
  )
  const groupId = group.rows[0].id

  const ids: string[] = []
  for (const name of ['You', 'Priya', 'Rahul', 'Aman']) {
    const row = await db.query<{ id: string }>(
      `insert into participants (group_id, display_name) values ($1, $2) returning id`,
      [groupId, name],
    )
    ids.push(row.rows[0].id)
  }
  return { groupId, participants: ids }
}

async function addExpense(
  groupId: string,
  payers: [string, bigint][],
  shares: [string, bigint][],
) {
  await db.exec('begin')
  try {
    const expense = await db.query<{ id: string }>(
      `insert into expenses (group_id, description, currency)
       values ($1, 'Beach house', 'INR') returning id`,
      [groupId],
    )
    const expenseId = expense.rows[0].id
    for (const [participantId, amount] of payers) {
      await db.query(
        `insert into expense_payers (expense_id, participant_id, amount_minor)
         values ($1, $2, $3)`,
        [expenseId, participantId, amount.toString()],
      )
    }
    for (const [participantId, amount] of shares) {
      await db.query(
        `insert into expense_shares (expense_id, participant_id, amount_minor)
         values ($1, $2, $3)`,
        [expenseId, participantId, amount.toString()],
      )
    }
    await db.exec('commit')
    return expenseId
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

beforeAll(async () => {
  db = new PGlite()
  await applyMigrations()
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe('the schema applies', () => {
  it('creates every table the ledger needs', async () => {
    const result = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    )
    expect(result.rows.map((r) => r.table_name)).toEqual([
      'expense_payers',
      'expense_shares',
      'expenses',
      'groups',
      'nudges',
      'participants',
      'payment_ids',
      'settlements',
      'users',
    ])
  })
})

describe('money conservation', () => {
  it('accepts an expense whose payers and shares agree', async () => {
    const { groupId, participants } = await seedGroup()
    const shares: [string, bigint][] = [
      [participants[0], 3100n],
      [participants[1], 3100n],
      [participants[2], 3100n],
      [participants[3], 3100n],
    ]
    const id = await addExpense(groupId, [[participants[1], 12400n]], shares)
    expect(id).toBeTruthy()
  })

  it('refuses an expense where the shares do not add up to what was paid', async () => {
    const { groupId, participants } = await seedGroup()
    await expect(
      addExpense(
        groupId,
        [[participants[1], 12400n]],
        [
          [participants[0], 3100n],
          [participants[1], 3100n],
          [participants[2], 3100n],
          // One paisa short. The whole transaction has to fail.
          [participants[3], 3099n],
        ],
      ),
    ).rejects.toThrow(/does not conserve money/)
  })

  it('accepts several payers as long as the totals still match', async () => {
    const { groupId, participants } = await seedGroup()
    const id = await addExpense(
      groupId,
      [
        [participants[0], 8000n],
        [participants[1], 4400n],
      ],
      [
        [participants[0], 6200n],
        [participants[1], 6200n],
      ],
    )
    expect(id).toBeTruthy()
  })

  it('refuses to leave an expense unbalanced by deleting one share', async () => {
    const { groupId, participants } = await seedGroup()
    const id = await addExpense(
      groupId,
      [[participants[0], 1000n]],
      [
        [participants[0], 500n],
        [participants[1], 500n],
      ],
    )
    await expect(
      db.exec(`delete from expense_shares where expense_id = '${id}'
               and participant_id = '${participants[1]}'`),
    ).rejects.toThrow(/does not conserve money/)
  })

  it('lets an expense be deleted outright, rows and all', async () => {
    const { groupId, participants } = await seedGroup()
    const id = await addExpense(
      groupId,
      [[participants[0], 1000n]],
      [
        [participants[0], 500n],
        [participants[1], 500n],
      ],
    )
    await db.query(`delete from expenses where id = $1`, [id])
    const left = await db.query(`select 1 from expense_shares where expense_id = $1`, [id])
    expect(left.rows).toHaveLength(0)
  })
})

describe('amounts', () => {
  it('survives a bigint far beyond what a float could hold', async () => {
    const { groupId, participants } = await seedGroup()
    // Ninety thousand crore in paise, past 2^53.
    const huge = 9_000_000_000_000_000_00n
    const id = await addExpense(
      groupId,
      [[participants[0], huge]],
      [[participants[1], huge]],
    )
    const row = await db.query<{ amount_minor: string }>(
      `select amount_minor from expense_payers where expense_id = $1`,
      [id],
    )
    expect(BigInt(row.rows[0].amount_minor)).toBe(huge)
  })

  it('refuses a negative share', async () => {
    const { groupId, participants } = await seedGroup()
    await expect(
      addExpense(groupId, [[participants[0], 0n]], [[participants[1], -100n]]),
    ).rejects.toThrow(/non_negative/)
  })
})

describe('settlements', () => {
  it('refuses a payment to yourself and a payment of nothing', async () => {
    const { groupId, participants } = await seedGroup()
    const insert = (from: string, to: string, amount: string) =>
      db.query(
        `insert into settlements (group_id, from_participant_id, to_participant_id, amount_minor, currency)
         values ($1, $2, $3, $4, 'INR')`,
        [groupId, from, to, amount],
      )

    await expect(insert(participants[0], participants[0], '100')).rejects.toThrow(
      /distinct_parties/,
    )
    await expect(insert(participants[0], participants[1], '0')).rejects.toThrow(
      /amount_positive/,
    )
    await expect(insert(participants[0], participants[1], '100')).resolves.toBeTruthy()
  })

  it('starts life proposed, because nobody has confirmed it yet', async () => {
    const { groupId, participants } = await seedGroup()
    const row = await db.query<{ status: string }>(
      `insert into settlements (group_id, from_participant_id, to_participant_id, amount_minor, currency)
       values ($1, $2, $3, 340, 'INR') returning status`,
      [groupId, participants[0], participants[1]],
    )
    expect(row.rows[0].status).toBe('proposed')
  })
})

describe('participants', () => {
  it('allows a person with no account, and many of them', async () => {
    const { groupId } = await seedGroup()
    await db.query(
      `insert into participants (group_id, display_name) values ($1, 'Guest'), ($1, 'Another guest')`,
      [groupId],
    )
    const count = await db.query<{ n: string }>(
      `select count(*) as n from participants where group_id = $1 and user_id is null`,
      [groupId],
    )
    expect(Number(count.rows[0].n)).toBe(6)
  })

  it('refuses to seat the same account twice in one group', async () => {
    const { groupId } = await seedGroup()
    const user = await db.query<{ id: string }>(
      `insert into users (email, display_name) values ('a@example.com', 'A') returning id`,
    )
    const userId = user.rows[0].id
    await db.query(
      `insert into participants (group_id, user_id, display_name) values ($1, $2, 'A')`,
      [groupId, userId],
    )
    await expect(
      db.query(
        `insert into participants (group_id, user_id, display_name) values ($1, $2, 'A again')`,
        [groupId, userId],
      ),
    ).rejects.toThrow(/participants_group_user_key/)
  })
})
