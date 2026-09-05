import { Amount } from '@/components/ui/amount'
import { fromMajor, money } from '@/lib/money'
import { BeamDemo } from './beam-demo'

export const metadata = { title: 'Specimen' }

const SWATCHES = [
  ['paper', 'bg-paper'],
  ['paper-raised', 'bg-paper-raised'],
  ['paper-sunken', 'bg-paper-sunken'],
  ['ink', 'bg-ink'],
  ['muted', 'bg-muted'],
  ['rule', 'bg-rule'],
  ['pos', 'bg-pos'],
  ['neg', 'bg-neg'],
] as const

const RECEIPT = [
  ['Paneer tikka', '2', '480.00'],
  ['Dal makhani', '1', '340.00'],
  ['Butter naan', '6', '270.00'],
  ['Sweet lime soda', '4', '360.00'],
] as const

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule py-10">
      <h2 className="mb-6 font-mono text-xs uppercase tracking-[0.18em] text-muted">
        {label}
      </h2>
      {children}
    </section>
  )
}

export default function SpecimenPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <header className="pb-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
          बाकी · baaki
        </p>
        <h1 className="mt-3 font-display text-5xl leading-none tracking-[-0.03em]">
          Design specimen
        </h1>
        <p className="mt-4 max-w-prose text-muted">
          Six colours, three typefaces, one signed axis. If something here is not an amount,
          it is ink on paper.
        </p>
      </header>

      <Section label="Palette">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map(([name, bg]) => (
            <div key={name}>
              <div className={`h-16 rounded border border-rule ${bg}`} />
              <p className="mt-2 font-mono text-xs text-muted">{name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Type">
        <div className="space-y-5">
          <p className="font-display text-5xl leading-none tracking-[-0.03em]">
            Settle up in one tap
          </p>
          <p className="max-w-prose">
            Body copy is Schibsted Grotesk. It carries every list row, every label, and
            every sentence that explains what a number means.
          </p>
          <p className="font-mono text-sm text-muted">
            IBM Plex Mono · 04 Sep 2026 · txn 8f2a41 · split 4 ways
          </p>
        </div>
      </Section>

      <Section label="Balance beam">
        <BeamDemo />
      </Section>

      <Section label="Amounts">
        <div className="space-y-6">
          <div>
            <Amount value={fromMajor('12400', 'INR')} size="display" />
            <p className="mt-2 text-sm text-muted">Display · neutral total</p>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4">
            <div>
              <Amount value={fromMajor('3100', 'INR')} size="title" tone="signed" signed />
              <p className="mt-1 text-sm text-muted">Rahul owes you</p>
            </div>
            <div>
              <Amount value={fromMajor('-340', 'INR')} size="title" tone="signed" />
              <p className="mt-1 text-sm text-muted">You owe Priya</p>
            </div>
            <div>
              <Amount value={money(0n, 'INR')} size="title" tone="signed" />
              <p className="mt-1 text-sm text-muted">Settled</p>
            </div>
          </div>
          <p className="text-sm text-muted">
            Lakh grouping and exact paise:{' '}
            <Amount value={fromMajor('1234567.05', 'INR')} tone="ink" /> · other currencies
            keep their own minor units:{' '}
            <Amount value={fromMajor('1200', 'JPY')} tone="ink" />
          </p>
        </div>
      </Section>

      <Section label="Receipt strip">
        <div className="max-w-sm border border-rule bg-paper-raised p-5 font-mono text-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Sagar Ratna · 04 Sep
          </p>
          <ul className="mt-4 space-y-1">
            {RECEIPT.map(([item, qty, amount]) => (
              <li key={item} className="flex justify-between gap-4">
                <span className="truncate">
                  <span className="text-muted">{qty}×</span> {item}
                </span>
                <span>{amount}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-rule pt-3">
            <span className="text-muted">Total</span>
            <Amount value={fromMajor('1450', 'INR')} className="font-mono" />
          </div>
        </div>
      </Section>
    </main>
  )
}
