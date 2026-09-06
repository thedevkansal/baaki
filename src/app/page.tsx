import type { Metadata } from 'next'
import Link from 'next/link'
import { Hero } from '@/components/marketing/hero'
import { Proof } from '@/components/marketing/proof'
import { SiteFooter } from '@/components/site-footer'

export const metadata: Metadata = {
  title: 'Baaki, kitna baaki hai?',
}

/** Every one of these is behind Splitwise Pro. Source: splitwise.com/pro */
const PAYWALLED = [
  'Unlimited expenses a day',
  'More than one person paying',
  'Currency conversion',
  'Receipt scanning',
  'Itemising a receipt',
  'Searching your own history',
  'Charts and graphs',
  'Default split settings',
  'No video ads',
]

export default function LandingPage() {
  return (
    <>
      <main className="flex-1">
        <Hero />
        <Proof />

        <section
          id="pricing"
          className="border-t border-rule bg-paper-sunken px-6 py-24 sm:py-32"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-12 md:grid-cols-2 md:items-center">
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                What it costs
              </p>
              <h2 className="mt-6 font-display text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
                Everything they charge for, free.
              </h2>
              <p className="mt-6 max-w-md leading-relaxed text-muted">
                Splitwise put a daily cap on how many expenses you can add, then moved
                search, charts, receipt scanning and multiple payers behind Pro, and ran
                video ads in an app where people track real money.
              </p>
              <p className="mt-4 max-w-md leading-relaxed text-muted">
                Every line on this receipt is one of those features. Baaki is not selling
                them back to you.
              </p>
            </div>

            <div className="min-w-0 rounded-2xl border border-rule bg-paper p-7 font-mono text-sm sm:p-9">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                Baaki · your bill
              </p>

              <ul className="mt-7 space-y-2.5">
                {PAYWALLED.map((item) => (
                  <li key={item} className="flex items-baseline justify-between gap-6">
                    <span className="min-w-0 truncate text-ink">{item}</span>
                    <span className="shrink-0 tabular-nums text-muted">0.00</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex items-baseline justify-between border-t border-rule pt-5">
                <span className="text-xs uppercase tracking-[0.2em] text-muted">Total</span>
                <span className="font-display text-4xl tracking-[-0.02em] text-pos">
                  ₹0.00
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="limits" className="border-t border-rule px-6 py-24 sm:py-32">
          <div className="mx-auto w-full max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
              What Baaki cannot do
            </p>
            <h2 className="mt-6 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
              We can&rsquo;t see your payment.
            </h2>
            <div className="mt-7 space-y-5 leading-relaxed text-muted">
              <p>
                A UPI link opens your payment app, but nothing comes back to us. Verifying
                that money actually moved would mean becoming a payment merchant, with the
                fees and paperwork that brings.
              </p>
              <p>
                So settling is two-sided: you say you paid, and the other person confirms
                it. Balances move only then. It is the same trust your group already runs on
                We just stop pretending otherwise, and we never show a payment as verified
                when it isn&rsquo;t.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-rule bg-paper-sunken px-6 py-24 sm:py-28">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="max-w-xl font-display text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
              Stop asking the group chat.
            </h2>
            <Link
              href="/app"
              className="shrink-0 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              Open Baaki
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
