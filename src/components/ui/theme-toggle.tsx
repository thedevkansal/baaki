'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

export type Theme = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'baaki-theme'

/**
 * Runs before first paint so a dark-mode reader never sees a white flash.
 * Kept as a string because it has to be inlined into <head> ahead of React.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`

const ORDER: Theme[] = ['system', 'light', 'dark']

const LABELS: Record<Theme, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
}

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private browsing, or storage blocked. The theme still applies for now.
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  // Server renders 'system'; the real value arrives after mount, which is why
  // the inline script above owns the first paint rather than this component.
  const [theme, setTheme] = useState<Theme>('system')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-theme')
    setTheme(stored === 'light' || stored === 'dark' ? stored : 'system')
    setReady(true)
  }, [])

  const next = () => {
    const value = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
    setTheme(value)
    apply(value)
  }

  return (
    <button
      type="button"
      onClick={next}
      title={LABELS[theme]}
      aria-label={`Theme: ${LABELS[theme]}. Click to change.`}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border border-rule text-muted transition-colors hover:border-ink hover:text-ink',
        !ready && 'opacity-0',
        className,
      )}
    >
      {theme === 'light' ? <SunIcon /> : theme === 'dark' ? <MoonIcon /> : <SystemIcon />}
    </button>
  )
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden {...stroke}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden {...stroke}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  )
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden {...stroke}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  )
}
