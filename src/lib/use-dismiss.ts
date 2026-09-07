'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Close a popover on a click outside it, or on Escape.
 *
 * Deliberately a document listener rather than a full-screen overlay element.
 * An overlay has to be `position: fixed` to cover the viewport, and the header
 * it would live in uses `backdrop-filter`, which makes that element a
 * containing block for fixed descendants: the overlay quietly sized itself to
 * the header strip, so clicking anywhere below it hit nothing and the menu
 * would not close.
 *
 * A listener also lets the click through to whatever was clicked, which is what
 * people expect: dismissing a menu is not supposed to cost you the press.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && ref.current?.contains(target)) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close, ref])
}
