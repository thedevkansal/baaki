import type { Metadata } from 'next'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export const metadata: Metadata = {
  title: 'Your groups',
}

export default function AppLayout({ children }: LayoutProps<'/app'>) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-5 py-3.5">
          <Link href="/app" className="inline-flex items-baseline gap-2" aria-label="Baaki">
            <span className="font-devanagari text-lg leading-none">बाकी</span>
            <span className="text-sm font-medium tracking-tight">baaki</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-paper-sunken hover:text-ink"
            >
              About
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-6">{children}</main>
    </div>
  )
}
