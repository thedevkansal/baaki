'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'

export type Theme = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'baaki-theme'

const CHANGE_EVENT = 'baaki:themechange'

const ORDER: Theme[] = ['system', 'light', 'dark']

const LABELS: Record<Theme, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
}

/**
 * The document element is the source of truth, not React state, and the CSS
 * already follows the operating system on its own. Only an explicit override
 * needs restoring, which happens on mount.
 *
 * The obvious alternative, a blocking script inlined ahead of React, removes
 * the one-frame flash an override sees but makes React render a script tag it
 * warns about; the other, a cookie the server reads, moves the flash into a
 * hydration mismatch on `<html>`. Neither is worth it for a single frame that
 * only readers who picked the opposite of their system setting ever see.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CHANGE_EVENT, onChange)
}

function getSnapshot(): Theme {
  const value = document.documentElement.getAttribute('data-theme')
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** The server has no idea what the reader prefers, so it renders neutral. */
function getServerSnapshot(): Theme {
  return 'system'
}

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function apply(theme: Theme, persist: boolean) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)

  if (persist) {
    try {
      if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Private browsing, or storage blocked. The theme still applies for now.
    }
  }

  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Restores a saved override. This writes a DOM attribute and notifies the
  // store; it never copies anything into React state.
  useEffect(() => {
    const stored = readStored()
    if (stored && document.documentElement.getAttribute('data-theme') !== stored) {
      apply(stored, false)
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => apply(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length], true)}
      title={LABELS[theme]}
      aria-label={`Theme: ${LABELS[theme]}. Click to change.`}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border border-rule text-muted transition-colors hover:border-ink hover:text-ink',
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
