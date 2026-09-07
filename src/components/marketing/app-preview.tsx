import { Ruler, SectionMark } from '@/components/ui/ruler'
import { netBalances } from '@/lib/ledger/balances'
import type { ExpenseEntry, ParticipantRef } from '@/lib/ledger/types'
import { formatMoney } from '@/lib/format'
import { fromMajor, money, splitEqually, type Money } from '@/lib/money'

const INR = 'INR'
const YOU = 'user:you' as ParticipantRef
const PRIYA = 'user:priya' as ParticipantRef
const RAHUL = 'user:rahul' as ParticipantRef
const AMAN = 'user:aman' as ParticipantRef
const GROUP = [YOU, PRIYA, RAHUL, AMAN]

const NAMES: Record<string, string> = {
  [YOU]: 'You',
  [PRIYA]: 'Priya',
  [RAHUL]: 'Rahul',
  [AMAN]: 'Aman',
}

interface Bill {
  id: string
  description: string
  category: string
  payer: ParticipantRef
  total: string
  among: ParticipantRef[]
}

const BILLS: Bill[] = [
  {
    id: 'house',
    description: 'Beach house, three nights',
    category: 'Stay',
    payer: PRIYA,
    total: '12400',
    among: GROUP,
  },
  {
    id: 'scuba',
    description: 'Scuba diving',
    category: 'Entertainment',
    payer: RAHUL,
    total: '8800',
    among: [YOU, RAHUL],
  },
  {
    id: 'dinner',
    description: 'Dinner at Gunpowder',
    category: 'Food',
    payer: AMAN,
    total: '4700',
    among: GROUP,
  },
  {
    id: 'cab',
    description: 'Airport cab',
    category: 'Travel',
    payer: PRIYA,
    total: '890',
    among: GROUP,
  },
]

function entryOf(bill: Bill, seed: number): ExpenseEntry {
  const shares = splitEqually(fromMajor(bill.total, INR), bill.among.length, seed)
  return {
    id: bill.id,
    description: bill.description,
    payers: [{ ref: bill.payer, amount: fromMajor(bill.total, INR) }],
    shares: bill.among.map((ref, i) => ({ ref, amount: shares[i] })),
  }
}

/**
 * The app, drawn with the app's own parts.
 *
 * The numbers are computed by the ledger rather than typed in, for the same
 * reason the hero is: a screenshot goes stale the moment the product moves,
 * and a mocked balance is a promise nobody checked.
 */
export function AppPreview() {
  const entries = BILLS.map(entryOf)
  const balances = netBalances(entries, [], INR)

  const byCategory = new Map<string, bigint>()
  for (const [i, entry] of entries.entries()) {
    const total = entry.shares.reduce((acc, s) => acc + s.amount.minor, 0n)
    byCategory.set(BILLS[i].category, (byCategory.get(BILLS[i].category) ?? 0n) + total)
  }
  const categories = [...byCategory.entries()].sort((a, b) => Number(b[1] - a[1]))
  const biggest = categories[0][1]
  const spend = categories.reduce((acc, [, value]) => acc + value, 0n)

  const yourNet = balances.get(YOU) as Money

  return (
    <section className="pt-16 pb-24 sm:pb-32">
      <Ruler centerTick={false} />

      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <SectionMark label="The app itself" />
        <h2 className="mt-6 max-w-2xl font-display text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
          Every bill, every person, one number.
        </h2>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* ---- the group screen ---- */}
          <div className="overflow-hidden rounded-2xl border border-rule bg-paper-raised">
            <div className="border-b border-rule px-6 py-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                Goa trip
              </p>
              <p className="mt-3 font-display text-4xl leading-none tracking-[-0.03em] text-neg">
                {formatMoney(yourNet)}
              </p>
              <p className="mt-2 text-sm text-muted">is what you owe in this group</p>
            </div>

            <ul className="divide-y divide-rule">
              {entries.map((entry, i) => {
                const total = entry.shares.reduce((acc, s) => acc + s.amount.minor, 0n)
                const yours = entry.shares.find((s) => s.ref === YOU)?.amount.minor ?? 0n
                return (
                  <li key={entry.id} className="flex items-center gap-4 px-6 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.description}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {NAMES[BILLS[i].payer]} paid · {BILLS[i].category}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm tabular-nums">
                        {formatMoney(money(total, INR))}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                        you {formatMoney(money(yours, INR))}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ---- the charts ---- */}
          <div className="overflow-hidden rounded-2xl border border-rule bg-paper-raised">
            <div className="flex items-baseline justify-between gap-4 border-b border-rule px-6 py-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                Where it went
              </p>
              <p className="font-mono text-sm tabular-nums text-muted">
                {formatMoney(money(spend, INR))}
              </p>
            </div>

            <ul className="space-y-5 px-6 py-6">
              {categories.map(([label, value]) => (
                <li key={label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="truncate text-sm">{label}</span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                      {formatMoney(money(value, INR))}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full bg-pos"
                      style={{ width: `${(Number(value) / Number(biggest)) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-rule px-6 py-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                Who has been carrying it
              </p>
              <ul className="mt-4 space-y-2">
                {[...balances.entries()]
                  .sort((a, b) => Number(b[1].minor - a[1].minor))
                  .map(([ref, net]) => (
                    <li key={ref} className="flex items-baseline justify-between gap-4">
                      <span className="truncate text-sm">{NAMES[ref]}</span>
                      <span
                        className={`shrink-0 font-mono text-sm tabular-nums ${
                          net.minor < 0n
                            ? 'text-neg'
                            : net.minor > 0n
                              ? 'text-pos'
                              : 'text-muted'
                        }`}
                      >
                        {formatMoney(net)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
