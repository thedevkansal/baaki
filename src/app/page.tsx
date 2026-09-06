import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/hero'

export const metadata: Metadata = {
  title: 'Baaki — kitna baaki hai?',
}

const REPO = 'https://github.com/thedevkansal/baaki'

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

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span className="font-devanagari text-xl leading-none">बाकी</span>
      <span className="text-[15px] font-medium tracking-tight">baaki</span>
    </span>
  )
}

export default function LandingPage() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Wordmark />
        <nav className="flex items-center gap-6 text-sm">
          <a href="#pricing" className="text-muted transition-colors hover:text-ink">
            What it costs
          </a>
          <a
            href={REPO}
            className="rounded-full border border-rule px-4 py-2 transition-colors hover:border-ink"
          >
            Read the code
          </a>
        </nav>
      </header>

      <main className="flex-1">
        <Hero />

        <section
          id="pricing"
          className="border-t border-rule bg-paper-sunken px-6 py-24 sm:py-32"
        >
          <div className="mx-auto grid w-full max-w-5xl gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                What it costs
              </p>
              <h2 className="mt-6 font-display text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
                Everything they charge for, free.
              </h2>
              <p className="mt-6 max-w-md leading-relaxed text-muted">
                Splitwise put a daily cap on how many expenses you can add, then put search,
                charts, receipt scanning and multiple payers behind Pro — and ran video ads
                in an app where people track real money.
              </p>
              <p className="mt-4 max-w-md leading-relaxed text-muted">
                Every line on this receipt is one of those features. Baaki is not selling
                them back to you.
              </p>
            </div>

            <div className="border border-rule bg-paper p-7 font-mono text-sm sm:p-9">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                Baaki · your bill
              </p>

              <ul className="mt-7 space-y-2.5">
                {PAYWALLED.map((item) => (
                  <li key={item} className="flex items-baseline justify-between gap-6">
                    <span className="truncate text-ink">{item}</span>
                    <span className="shrink-0 tabular-nums text-muted">0.00</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 border-t border-rule pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted">
                    Total
                  </span>
                  <span className="font-display text-4xl tracking-[-0.02em] text-pos">
                    ₹0.00
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-rule px-6 py-24 sm:py-32">
          <div className="mx-auto grid w-full max-w-5xl gap-12 md:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                One tap to settle
              </p>
              <h2 className="mt-6 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
                Your UPI app opens already filled in.
              </h2>
              <p className="mt-6 leading-relaxed text-muted">
                Payee, exact amount, and a note saying which trip it was. No switching apps
                to hunt for a UPI ID and retype a number you already entered here.
              </p>
            </div>

            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                Why do I owe Rahul?
              </p>
              <h2 className="mt-6 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
                Every simplified debt shows its working.
              </h2>
              <p className="mt-6 leading-relaxed text-muted">
                Tap the number and Baaki names the original expenses it replaced — not a
                mystery payment to someone you never bought anything with.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-rule px-6 py-24 sm:py-32">
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
                — we just stop pretending otherwise, and we never show a payment as verified
                when it isn&rsquo;t.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule px-6 py-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              Built in the open. The ledger, the splitting maths and the UPI logic are all
              readable — and tested to the paisa.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <a
              href={REPO}
              className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              Read the code
            </a>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              sign-ups open when the app ships
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}
