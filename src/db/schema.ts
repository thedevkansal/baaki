import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Money is stored as `bigint` counts of minor units, never numeric and never
 * float. Postgres returns bigint as a string to JavaScript, which is exactly
 * what we want: it goes straight into `BigInt()` and reaches the ledger exact.
 *
 * Every table that holds an amount also holds the currency it is denominated
 * in, because an amount without one is not a quantity.
 */
const minor = (name: string) => bigint(name, { mode: 'bigint' })

const id = () => uuid('id').primaryKey().defaultRandom()

/**
 * The id this row already had on the device that created it.
 *
 * Rows are made offline first and only later pushed, so the client cannot be
 * handed a server id at creation time. Syncing on the id the client already
 * chose keeps a push idempotent without a mapping table on either side.
 */
const localId = () =>
  text('local_id')
    .notNull()
    // Defaulted in the database, not just in Drizzle: psql, the MCP server and
    // the tests all write here too, and a not-null column with no default is a
    // trap for every writer that is not this ORM.
    .default(sql`gen_random_uuid()::text`)
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

/**
 * A person who can sign in. Ghosts, people added by name alone, live in
 * `participants` and have no row here until they claim an account.
 */
export const users = pgTable('users', {
  id: id(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  defaultCurrency: char('default_currency', { length: 3 }).notNull().default('INR'),
  createdAt: createdAt(),
})

/**
 * A UPI ID, or later a bank reference. Encrypted at rest: it is the one piece
 * of data here that sends money somewhere if it leaks or is altered.
 */
export const paymentIds = pgTable(
  'payment_ids',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['upi', 'bank'] }).notNull(),
    valueEncrypted: text('value_encrypted').notNull(),
    label: text('label'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index('payment_ids_user_idx').on(table.userId)],
)

export const groups = pgTable(
  'groups',
  {
  id: id(),
  localId: localId(),
  name: text('name').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  simplify: boolean('simplify').notNull().default(true),
  /**
   * The device that first shared this group. Re-issuing somebody's join link
   * releases their seat, so it has to be one person's call rather than any
   * member's, or Rahul could reset your seat and take it.
   */
  ownerDeviceId: text('owner_device_id'),
  /**
   * One link for the whole group, not one per person.
   *
   * You invite people; you do not enrol them. Whoever opens it says who they
   * are and gives their own UPI ID, which is the only way either of those is
   * ever right: nobody else knows how Rahul spells his name or which VPA he
   * actually uses.
   */
  inviteToken: text('invite_token').unique(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: createdAt(),
  },
  /**
   * One row per group, ever. Without this the upsert in the sync push has no
   * conflict target, so it never conflicts and quietly inserts a second, empty
   * copy of the group on every share. A later pull then picks the empty twin
   * and reports the group as having no people and no bills, which the client
   * believes.
   */
  (table) => [uniqueIndex('groups_local_key').on(table.localId)],
)

/**
 * Everyone who can appear in a split, whether or not they have an account.
 *
 * "Add friends without contact info" is the 625 vote request Splitwise has
 * never built. Here a participant with a null `user_id` is a ghost: a real
 * name in a real ledger who simply has not signed up. Claiming an account
 * later fills in `user_id` and nothing else about the history changes.
 */
export const participants = pgTable(
  'participants',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    vpa: text('vpa'),
    localId: localId(),
    /**
     * The secret in this person's join link. One token per seat rather than one
     * per group, so a link says who you are as well as which group, and so a
     * leaked link costs exactly one seat.
     */
    claimToken: text('claim_token').unique(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /**
     * The device that claimed the seat. No accounts yet, so this is the whole
     * of identity: a random id the browser keeps in a cookie. Being able to say
     * "somebody already claimed this" is the point.
     */
    deviceId: text('device_id'),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('participants_group_idx').on(table.groupId),
    uniqueIndex('participants_group_local_key').on(table.groupId, table.localId),
    // One seat per account per group. Ghosts are unconstrained, since they
    // have no identity to collide on.
    uniqueIndex('participants_group_user_key')
      .on(table.groupId, table.userId)
      .where(sql`user_id is not null`),
  ],
)

export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    category: text('category').notNull().default('General'),
    occurredOn: date('occurred_on')
      .notNull()
      .default(sql`current_date`),
    splitMode: text('split_mode').notNull().default('equal'),
    /** The group's currency. Amounts below are already converted into it. */
    currency: char('currency', { length: 3 }).notNull(),
    /** What was actually spent, before conversion. Null when there was none. */
    originalCurrency: char('original_currency', { length: 3 }),
    originalMinor: minor('original_minor'),
    /** The rate used, captured at entry and never re-applied afterwards. */
    originalRate: text('original_rate'),
    localId: localId(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('expenses_group_idx').on(table.groupId, table.occurredOn),
    uniqueIndex('expenses_group_local_key').on(table.groupId, table.localId),
  ],
)

/** Who actually put money down. More than one person can. */
export const expensePayers = pgTable(
  'expense_payers',
  {
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    amountMinor: minor('amount_minor').notNull(),
  },
  (table) => [primaryKey({ columns: [table.expenseId, table.participantId] })],
)

/** Who consumed it. */
export const expenseShares = pgTable(
  'expense_shares',
  {
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    amountMinor: minor('amount_minor').notNull(),
  },
  (table) => [primaryKey({ columns: [table.expenseId, table.participantId] })],
)

/**
 * A payment between two people.
 *
 * `proposed` is one person's claim that they paid. Balances move only on
 * `confirmed`, because Baaki cannot see a UPI payment and will not pretend it
 * can. The pair of columns is deliberately not a single boolean: `disputed` is
 * a real answer that has to be recordable.
 */
export const settlements = pgTable(
  'settlements',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    fromParticipantId: uuid('from_participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    toParticipantId: uuid('to_participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    amountMinor: minor('amount_minor').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    method: text('method', { enum: ['upi', 'cash', 'bank', 'other'] })
      .notNull()
      .default('other'),
    status: text('status', { enum: ['proposed', 'confirmed', 'disputed'] })
      .notNull()
      .default('proposed'),
    localId: localId(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    initiatedBy: uuid('initiated_by').references(() => users.id, { onDelete: 'set null' }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('settlements_group_idx').on(table.groupId, table.status),
    uniqueIndex('settlements_group_local_key').on(table.groupId, table.localId),
  ],
)

export const groupsRelations = relations(groups, ({ many }) => ({
  participants: many(participants),
  expenses: many(expenses),
  settlements: many(settlements),
}))

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, { fields: [expenses.groupId], references: [groups.id] }),
  payers: many(expensePayers),
  shares: many(expenseShares),
}))

export const participantsRelations = relations(participants, ({ one }) => ({
  group: one(groups, { fields: [participants.groupId], references: [groups.id] }),
  user: one(users, { fields: [participants.userId], references: [users.id] }),
}))
