import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:opacity-90',
  secondary: 'border border-rule hover:border-ink hover:bg-paper-sunken',
  ghost: 'text-muted hover:bg-paper-sunken hover:text-ink',
  danger: 'border border-neg text-neg hover:bg-neg hover:text-paper',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  asChild?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  asChild = false,
  className,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
