'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/cn'

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'What it costs' },
  { href: '/#limits', label: 'What it cannot do' },
]

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className="font-devanagari text-xl leading-none">बाकी</span>
      <span className="text-[15px] font-medium tracking-tight">baaki</span>
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
        'sticky top-0 z-50 transition-colors duration-200',
        scrolled || inApp
          ? 'border-b border-rule bg-paper/85 backdrop-blur-md'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-4">
        <Link href="/" className="shrink-0 rounded-sm" aria-label="Baaki, home">
          <Wordmark />
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-paper-sunken hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
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
