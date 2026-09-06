import { cn } from '@/lib/cn'

/**
 * The number line, drawn as one.
 *
 * This is the product's signature mark. A balance is a point on a scale, so
 * the scale itself is what separates one part of the interface from the next.
 * It recurs deliberately: a device used once is decoration, a device used
 * throughout is an identity.
 */
export function Ruler({
  centerTick = true,
  className,
}: {
  /** The zero mark. Off for dividers that are not measuring anything. */
  centerTick?: boolean
  className?: string
}) {
  return (
    <div className={cn('pointer-events-none select-none', className)} aria-hidden>
      <div className="ruler-ticks h-3 w-full opacity-70" />
      <div
        className="h-px w-full bg-rule"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        }}
      />
      {centerTick && <div className="mx-auto h-4 w-px bg-ink/40" />}
    </div>
  )
}

/** A short rule with a tick, for labelling a section without a full scale. */
export function SectionMark({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="h-px w-8 bg-rule" aria-hidden />
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
        {label}
      </span>
    </div>
  )
}
