import type { MetadataRoute } from 'next'

/**
 * Installable, because this is a phone app that happens to be on the web.
 * Somebody splitting a bill at a table is not going to open a browser, find a
 * tab and wait for a page: they tap an icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Baaki',
    short_name: 'Baaki',
    description:
      'kitna baaki hai? Split any bill, any way, with anyone. Settle up over UPI in one tap.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#141219',
    theme_color: '#141219',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
