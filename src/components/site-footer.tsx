import Link from 'next/link'
import { Ruler } from '@/components/ui/ruler'
import { Wordmark } from '@/components/site-header'

/**
 * Five links do not need three columns and two headings.
 *
 * Sorting five things into "Product" and "Honest about" spread them across the
 * full width with a hole in the middle, and made the reader parse a taxonomy to
 * find one link. They sit in one row now, and the space that was empty goes to
 * the question the product is named after.
 */
const LINKS = [
  { href: '/app', label: 'Your groups' },
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'What it costs' },
  { href: '/#limits', label: 'What it cannot do' },
]

export function SiteFooter() {
  return (
    <footer className="mt-24">
      <Ruler centerTick={false} />

      <div className="mx-auto w-full max-w-6xl px-6 pb-14 pt-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Split any bill, any way, with anyone. Settle up in one tap. Every feature
              free, including the ones you are currently paying for.
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-7 gap-y-3 sm:justify-end">
              {LINKS.map((link) => (
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
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-rule pt-8 sm:flex-row sm:items-baseline sm:justify-between">
          {/* Devanagari sets one word and one word only: बाकी, in the
              wordmark. The phrase itself stays transliterated, because that is
              how it actually gets typed. */}
          <p className="font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-none tracking-[-0.03em]">
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
