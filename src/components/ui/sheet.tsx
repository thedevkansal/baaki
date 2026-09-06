'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Shown under the title. Also what a screen reader hears as the description. */
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * A panel that slides up from the bottom on a phone and sits centred on a
 * desktop. Every flow that adds or settles money happens in one of these, so
 * the list behind it stays on screen as context.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col border-rule bg-paper',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86dvh] sm:w-[min(34rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-xl tracking-[-0.02em]">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper-sunken hover:text-ink"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer && (
            <div className="border-t border-rule px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
