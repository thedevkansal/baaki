import QRCode from 'qrcode'
import { cn } from '@/lib/cn'

/**
 * A UPI QR, drawn as SVG.
 *
 * `QRCode.create` is synchronous and returns the raw module matrix, so the
 * code renders in the same pass as everything else: no effect, no async state,
 * no flash of an empty square. Drawing it ourselves also means it inherits
 * `currentColor` and is correct in both themes, which a generated PNG data URL
 * would not be.
 */
export function QrCode({
  value,
  className,
  title,
}: {
  value: string
  className?: string
  title: string
}) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const size = modules.size
  const quiet = 2
  const extent = size + quiet * 2

  const rects: string[] = []
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules.data[y * size + x]) {
        rects.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      role="img"
      aria-label={title}
      className={cn('h-auto w-full', className)}
      shapeRendering="crispEdges"
    >
      <rect width={extent} height={extent} fill="var(--paper-raised)" />
      <path d={rects.join('')} fill="currentColor" />
    </svg>
  )
}
