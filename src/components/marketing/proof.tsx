import { netBalances, pairwiseDebts } from '@/lib/ledger/balances'
import { simplify } from '@/lib/ledger/simplify'
import type { ExpenseEntry, ParticipantRef } from '@/lib/ledger/types'
import { formatMoney } from '@/lib/format'
import { buildUpiLink } from '@/lib/upi/link'
import { fromMajor, splitEqually } from '@/lib/money'

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

function equalExpense(
  id: string,
  description: string,
  payer: ParticipantRef,
  total: string,
  seed: number,
): ExpenseEntry {
  const shares = splitEqually(fromMajor(total, INR), GROUP.length, seed)
  return {
    id,
    description,
    payers: [{ ref: payer, amount: fromMajor(total, INR) }],
    shares: GROUP.map((ref, i) => ({ ref, amount: shares[i] })),
  }
}

const TRIP: ExpenseEntry[] = [
  equalExpense('house', 'Beach house', PRIYA, '12400', 0),
  equalExpense('dinner', 'Dinner', AMAN, '3200', 1),
  equalExpense('cab', 'Airport cab', RAHUL, '890', 2),
]

/**
 * Both panels below are rendered from the real ledger at build time, not
 * written by hand. If simplification ever stops being explainable, this
 * section breaks visibly instead of quietly lying.
 */
export function Proof() {
  const balances = netBalances(TRIP, [], INR)
  const edges = pairwiseDebts(TRIP, [], INR)
  const { transfers, provenance } = simplify(balances, edges, INR)

  const index = transfers.findIndex((t) => t.from === YOU)
  const transfer = transfers[index]
  const why = provenance[index]

  const upiLink = buildUpiLink({
    vpa: 'priya@okhdfcbank',
    payeeName: NAMES[transfer.to],
    amount: transfer.amount,
    note: 'Baaki Goa trip',
    reference: 'stl8f2a41',
  })
  const upiParams = new URLSearchParams(upiLink.split('?')[1])

  return (
    <section id="how" className="border-t border-rule px-6 py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          How it works
        </p>
        <h2 className="mt-6 max-w-2xl font-display text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
          Two things Splitwise still makes you do by hand.
        </h2>

        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:gap-12">
          {/* ---- one tap to settle ---- */}
          <article className="min-w-0">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-muted">01</span>
              <h3 className="font-display text-2xl tracking-[-0.02em]">
                Your UPI app opens already filled in
              </h3>
            </div>
            <p className="mt-4 max-w-md leading-relaxed text-muted">
              No switching apps to hunt for a UPI ID and retype an amount you already
              entered here. One tap, everything prefilled.
            </p>

            <div className="mt-8 overflow-hidden rounded-2xl border border-rule bg-paper-raised">
              <div className="flex items-center justify-between border-b border-rule px-5 py-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                  Paying
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                  UPI
                </span>
              </div>

              <div className="px-5 py-7">
                <p className="text-sm text-muted">To</p>
                <p className="mt-1 text-lg font-medium">{NAMES[transfer.to]}</p>
                <p className="font-mono text-sm text-muted">{upiParams.get('pa')}</p>

                <p className="mt-7 text-sm text-muted">Amount</p>
                <p className="font-display text-5xl leading-none tracking-[-0.03em]">
                  {formatMoney(transfer.amount)}
                </p>

                <p className="mt-7 text-sm text-muted">Note</p>
                <p className="font-mono text-sm">{upiParams.get('tn')}</p>
              </div>

              <div className="border-t border-rule px-5 py-4">
                <div className="rounded-full bg-ink py-3 text-center text-sm font-medium text-paper">
                  Confirm in your UPI app
                </div>
                <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  gpay · phonepe · paytm · bhim
                </p>
              </div>
            </div>
          </article>

          {/* ---- why do I owe Rahul ---- */}
          <article className="min-w-0">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-muted">02</span>
              <h3 className="font-display text-2xl tracking-[-0.02em]">
                Every simplified debt shows its working
              </h3>
            </div>
            <p className="mt-4 max-w-md leading-relaxed text-muted">
              Simplifying a group down to the fewest payments is easy. Explaining the result
              is the part nobody does — so people end up owing money to someone they never
              bought anything with.
            </p>

            <div className="mt-8 overflow-hidden rounded-2xl border border-rule bg-paper-raised">
              <div className="border-b border-rule px-6 py-6">
                <p className="text-sm text-muted">You pay {NAMES[transfer.to]}</p>
                <p className="mt-1 font-display text-5xl leading-none tracking-[-0.03em] text-neg">
                  {formatMoney(transfer.amount)}
                </p>
              </div>

              <div className="px-6 py-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                  This replaces
                </p>
                <ul className="mt-4 space-y-3">
                  {why.replaces.map((debt) => (
                    <li
                      key={`${debt.from}-${debt.to}`}
                      className="flex items-baseline justify-between gap-4 border-b border-rule pb-3 last:border-0 last:pb-0"
                    >
                      <span className="text-sm">
                        You owed <span className="font-medium">{NAMES[debt.to]}</span>
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {formatMoney(debt.amount)}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-sm leading-relaxed text-muted">
                  {NAMES[transfer.to]} settles those on your behalf, so the group clears in{' '}
                  {transfers.length} payments instead of {edges.length}.
                </p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
