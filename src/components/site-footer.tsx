import Link from 'next/link'
import { Ruler } from '@/components/ui/ruler'
import { Wordmark } from '@/components/site-header'

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '/app', label: 'Your groups' },
      { href: '/#how', label: 'How it works' },
      { href: '/#pricing', label: 'What it costs' },
    ],
  },
  {
    heading: 'Honest about',
    links: [
      { href: '/#limits', label: 'What it cannot do' },
      { href: '/#limits', label: 'Why settling is two-sided' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="mt-24">
      <Ruler centerTick={false} />

      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-14">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
              Split any bill, any way, with anyone. Settle up in one tap. Every feature
              free, including the ones you are currently paying for.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                {column.heading}
              </p>
              <ul className="mt-5 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-rule pt-7 sm:flex-row sm:items-center sm:justify-between">
          {/* Devanagari sets one word and one word only: बाकी, in the
              wordmark. The phrase itself stays transliterated, because that is
              how it actually gets typed. */}
          <p className="font-display text-2xl tracking-[-0.02em] text-muted">
            kitna baaki hai?
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            exact to the paisa
          </p>
        </div>
      </div>
    </footer>
  )
}
