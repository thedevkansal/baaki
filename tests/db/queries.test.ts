import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  addExpense,
  createGroup,
  loadGroupLedger,
  proposeSettlement,
  setSettlementStatus,
  softDeleteExpense,
  type Db,
} from '@/db/queries'
import { netBalances, pairwiseDebts } from '@/lib/ledger/balances'
import { simplify } from '@/lib/ledger/simplify'
import { fromMajor, splitEqually } from '@/lib/money'

/**
 * The query layer, run against the real engine.
 *
 * The point of these is the round trip: rows written by the queries, read back
 * out, and fed to the same ledger functions the UI uses. If storage ever
 * disagreed with the maths, it would show up here.
 */
let client: PGlite
let db: Db

const INR = 'INR'

beforeAll(async () => {
  client = new PGlite()
  const dir = path.join(process.cwd(), 'drizzle')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) await client.exec(trimmed)
    }
  }
  db = drizzle(client, { schema }) as unknown as Db
}, 60_000)

afterAll(async () => {
  await client.close()
})

async function goaTrip() {
  const { group, participants } = await createGroup(db, {
    name: 'Goa trip',
    currency: INR,
    members: [
      { displayName: 'You' },
      { displayName: 'Priya' },
      { displayName: 'Rahul' },
      { displayName: 'Aman' },
    ],
  })
  const [you, priya, rahul, aman] = participants
  return { group, you, priya, rahul, aman, participants }
}

async function equalExpense(
  groupId: string,
  payerId: string,
  total: string,
  participantIds: string[],
  seed = 0,
) {
  const shares = splitEqually(fromMajor(total, INR), participantIds.length, seed)
  return addExpense(db, {
    groupId,
    description: 'Beach house',
    currency: INR,
    payers: [{ participantId: payerId, minor: fromMajor(total, INR).minor }],
    shares: participantIds.map((participantId, i) => ({
      participantId,
      minor: shares[i].minor,
    })),
  })
}

describe('groups and people', () => {
  it('creates a group with everyone in it, accounts or not', async () => {
    const { group, participants } = await goaTrip()
    expect(group.currency).toBe(INR)
    expect(participants).toHaveLength(4)
    expect(participants.every((p) => p.userId === null)).toBe(true)
  })
})

describe('a full trip, written and read back', () => {
  it('reproduces the same balances the ledger computes in memory', async () => {
    const { group, you, priya, rahul, aman } = await goaTrip()
    const ids = [you.id, priya.id, rahul.id, aman.id]

    await equalExpense(group.id, priya.id, '12400', ids, 0)
    await equalExpense(group.id, you.id, '3200', ids, 1)

    const loaded = await loadGroupLedger(db, group.id)
    expect(loaded).not.toBeNull()

    const balances = netBalances(loaded!.entries, loaded!.settlements, INR)
    const total = [...balances.values()].reduce((a, m) => a + m.minor, 0n)
    expect(total).toBe(0n)

    // Priya put down 12,400 and consumed 3,100 + 800.
    expect(balances.get(`user:${priya.id}`)!.minor).toBe(850000n)
    // You put down 3,200 and consumed 3,100 + 800, so you are 700 short.
    expect(balances.get(`user:${you.id}`)!.minor).toBe(-70000n)
    expect(balances.get(`user:${rahul.id}`)!.minor).toBe(-390000n)
    expect(balances.get(`user:${aman.id}`)!.minor).toBe(-390000n)
  })

  it('simplifies what it loaded, and the transfers still settle everyone', async () => {
    const { group, you, priya, rahul, aman } = await goaTrip()
    const ids = [you.id, priya.id, rahul.id, aman.id]
    await equalExpense(group.id, priya.id, '840', ids, 0)
    await equalExpense(group.id, aman.id, '520', ids, 1)

    const loaded = (await loadGroupLedger(db, group.id))!
    const balances = netBalances(loaded.entries, loaded.settlements, INR)
    const { transfers } = simplify(
      balances,
      pairwiseDebts(loaded.entries, loaded.settlements, INR),
      INR,
    )

    const after = new Map([...balances].map(([ref, m]) => [ref, m.minor]))
    for (const t of transfers) {
      after.set(t.from, after.get(t.from)! + t.amount.minor)
      after.set(t.to, after.get(t.to)! - t.amount.minor)
    }
    for (const value of after.values()) expect(value).toBe(0n)
    expect(transfers.length).toBeLessThanOrEqual(3)
  })

  it('keeps a foreign currency bill readable as what was actually spent', async () => {
    const { group, you, priya } = await goaTrip()
    await addExpense(db, {
      groupId: group.id,
      description: 'Scuba',
      currency: INR,
      payers: [{ participantId: you.id, minor: 880000n }],
      shares: [
        { participantId: you.id, minor: 440000n },
        { participantId: priya.id, minor: 440000n },
      ],
      original: { currency: 'USD', minor: 10000n, rate: '88' },
    })

    const rows = await db.select().from(schema.expenses)
    const scuba = rows.find((r) => r.description === 'Scuba')!
    expect(scuba.originalCurrency).toBe('USD')
    expect(scuba.originalMinor).toBe(10000n)
    expect(scuba.originalRate).toBe('88')
  })

  it('refuses to write an expense that does not conserve money', async () => {
    const { group, you, priya } = await goaTrip()
    await expect(
      addExpense(db, {
        groupId: group.id,
        description: 'Broken',
        currency: INR,
        payers: [{ participantId: you.id, minor: 10000n }],
        shares: [{ participantId: priya.id, minor: 9999n }],
      }),
    ).rejects.toThrow(/does not conserve money/)

    // And nothing was left behind by the failed transaction.
    const rows = await db.select().from(schema.expenses)
    expect(rows.some((r) => r.description === 'Broken')).toBe(false)
  })

  it('drops a soft deleted expense out of the ledger', async () => {
    const { group, you, priya } = await goaTrip()
    const expense = await equalExpense(group.id, you.id, '1000', [you.id, priya.id])

    let loaded = (await loadGroupLedger(db, group.id))!
    expect(loaded.entries).toHaveLength(1)

    await softDeleteExpense(db, expense.id)
    loaded = (await loadGroupLedger(db, group.id))!
    expect(loaded.entries).toHaveLength(0)
  })
})

describe('settling', () => {
  it('moves nothing until the other person confirms', async () => {
    const { group, you, priya } = await goaTrip()
    await equalExpense(group.id, priya.id, '1000', [you.id, priya.id])

    const settlement = await proposeSettlement(db, {
      groupId: group.id,
      fromParticipantId: you.id,
      toParticipantId: priya.id,
      minor: 50000n,
      currency: INR,
      method: 'upi',
    })
    expect(settlement.status).toBe('proposed')

    let loaded = (await loadGroupLedger(db, group.id))!
    expect(
      netBalances(loaded.entries, loaded.settlements, INR).get(`user:${you.id}`)!.minor,
    ).toBe(-50000n)

    await setSettlementStatus(db, settlement.id, 'confirmed')
    loaded = (await loadGroupLedger(db, group.id))!
    expect(
      netBalances(loaded.entries, loaded.settlements, INR).get(`user:${you.id}`)!.minor,
    ).toBe(0n)
  })

  it('leaves a disputed claim out of the balances', async () => {
    const { group, you, priya } = await goaTrip()
    await equalExpense(group.id, priya.id, '1000', [you.id, priya.id])
    const settlement = await proposeSettlement(db, {
      groupId: group.id,
      fromParticipantId: you.id,
      toParticipantId: priya.id,
      minor: 50000n,
      currency: INR,
    })
    await setSettlementStatus(db, settlement.id, 'disputed')

    const loaded = (await loadGroupLedger(db, group.id))!
    expect(
      netBalances(loaded.entries, loaded.settlements, INR).get(`user:${you.id}`)!.minor,
    ).toBe(-50000n)
  })
})
