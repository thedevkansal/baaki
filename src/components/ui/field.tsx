import { cn } from '@/lib/cn'

export const inputClass =
  'w-full rounded-xl border border-rule bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-ink'

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span className="mt-1.5 block text-xs text-neg">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  )
}

/** A row of mutually exclusive options that reads as one control. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-1 overflow-x-auto rounded-full border border-rule p-1',
        className,
      )}
      role="tablist"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors',
            value === option.value
              ? 'bg-ink text-paper'
              : 'text-muted hover:bg-paper-sunken hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Initials in a circle. No avatar uploads, no gravatar, no third party. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span
      aria-hidden
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-sunken text-xs font-medium text-muted',
        className,
      )}
    >
      {initials || '?'}
    </span>
  )
}
