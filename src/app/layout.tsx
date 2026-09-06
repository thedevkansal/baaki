import type { Metadata, Viewport } from 'next'
import {
  Anek_Devanagari,
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Schibsted_Grotesk,
} from 'next/font/google'
import { SiteHeader } from '@/components/site-header'
import './globals.css'

/** Display face. Balance figures and screen titles only - never body copy. */
const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  display: 'swap',
})

/** Body and UI. Carries tabular figures for every amount in a list. */
const schibsted = Schibsted_Grotesk({
  variable: '--font-schibsted',
  subsets: ['latin'],
  display: 'swap',
})

/**
 * Devanagari, for exactly one word: बाकी. Bricolage has no Devanagari, so this
 * is a necessity rather than a fourth voice - and it never sets anything else.
 */
const anek = Anek_Devanagari({
  variable: '--font-anek',
  subsets: ['devanagari'],
  display: 'swap',
})

/** Utility. Receipt lines, split math, timestamps - things that are columnar. */
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Baaki',
    template: '%s · Baaki',
  },
  description:
    'kitna baaki hai? Split any bill, any way, with anyone. Settle up over UPI in one tap. Every feature free.',
  applicationName: 'Baaki',
  appleWebApp: { capable: true, title: 'Baaki', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#141219' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${schibsted.variable} ${plexMono.variable} ${anek.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  )
}
