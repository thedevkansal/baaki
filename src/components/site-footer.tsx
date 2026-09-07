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

/**
 * The columns are sized to their content and pushed to the right edge.
 *
 * They used to be fractions of the width, which put the last column's start on
 * a grid line but left its text ending well short of the right edge, so the
 * block floated instead of being anchored: the rule above it and the line below
 * it both reached the edge and the columns did not.
 */
export function SiteFooter() {
  return (
    <footer className="mt-24">
      <Ruler centerTick={false} />

      <div className="mx-auto w-full max-w-6xl px-6 pb-10 pt-11">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Split any bill, any way, with anyone. Settle up in one tap. Every feature
              free, including the ones you are currently paying for.
            </p>
          </div>

          <div className="flex gap-12 sm:gap-16">
            {COLUMNS.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                  {column.heading}
                </p>
                <ul className="mt-4 space-y-2.5">
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
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-rule pt-6 sm:flex-row sm:items-baseline sm:justify-between">
          {/* Devanagari sets one word and one word only: बाकी, in the
              wordmark. The phrase itself stays transliterated, because that is
              how it actually gets typed. */}
          <p className="font-display text-2xl leading-none tracking-[-0.02em] text-muted">
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
