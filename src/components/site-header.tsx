'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NudgeBell } from '@/components/ui/nudge-bell'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/cn'

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'What it costs' },
  { href: '/#limits', label: 'What it cannot do' },
]

/**
 * The mark: the balance beam, which is the whole product in one glyph.
 *
 * A zero line with weight either side of it, the short plum arm against the
 * long teal one. It is the same picture the app draws at full size on every
 * group screen, so the logo is not decoration bolted on afterwards, it is the
 * thing itself at 20 pixels.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 24"
      className={cn('h-6 w-7 shrink-0', className)}
      role="img"
      aria-hidden
    >
      <line x1="0" y1="12" x2="28" y2="12" stroke="var(--rule)" strokeWidth="1" />
      <rect x="3" y="8.5" width="7" height="7" rx="2" fill="var(--neg)" />
      <rect x="12.5" y="8.5" width="12.5" height="7" rx="2" fill="var(--pos)" />
      <line
        x1="11.25"
        y1="4"
        x2="11.25"
        y2="20"
        stroke="var(--ink)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The mark plus the name, once.
 *
 * It used to set बाकी and "baaki" side by side, which is the same word twice
 * and reads as a stutter to anybody who can read either script. The Devanagari
 * belongs in the hero, where it is being introduced, not in furniture.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark />
      <span className="font-display text-[19px] font-semibold leading-none tracking-[-0.02em]">
        baaki
      </span>
    </span>
  )
}

/**
 * One bar, every page.
 *
 * The navigation does not reshuffle itself between the site and the app: the
 * same links sit in the same places whether you are reading about Baaki or
 * using it, so nothing has to be relearned on the way in.
 */
export function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const inApp = pathname.startsWith('/app')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        /**
         * The bar always sits on its own surface. Transparent over the hero
         * meant it read as part of the page rather than as furniture on top of
         * it, and paper-raised is a different shade from the ground in both
         * themes, so the edge is visible without a hard line doing the work.
         */
        'sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-200',
        scrolled || inApp
          ? 'border-rule bg-paper-raised/90'
          : 'border-rule/60 bg-paper-raised/70',
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-4">
        <Link href="/" className="shrink-0 rounded-sm" aria-label="Baaki, home">
          <Wordmark />
        </Link>

        <nav className="hidden flex-1 items-center gap-7 md:flex" aria-label="Main">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group relative py-1 text-sm text-muted transition-colors hover:text-ink"
            >
              {link.label}
              {/* The rule grows from the left, the way the beam does. */}
              <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-ink transition-transform duration-200 ease-out group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <NudgeBell />
          <ThemeToggle />
          <Link
            href={inApp ? '/app' : '/app'}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90',
              'bg-ink text-paper',
            )}
          >
            {inApp ? 'Your groups' : 'Open Baaki'}
          </Link>
        </div>
      </div>
    </header>
  )
}
