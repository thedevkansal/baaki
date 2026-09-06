import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Your groups',
}

export default function AppLayout({ children }: LayoutProps<'/app'>) {
  return <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-8">{children}</main>
}
