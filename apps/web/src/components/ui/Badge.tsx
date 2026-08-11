import { clsx } from 'clsx'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'brand' | 'success' | 'warning' | 'destructive' | 'outline'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-stone-800 text-stone-100': variant === 'default',
          'bg-brand-900/50 text-brand-300': variant === 'brand',
          'bg-emerald-900/50 text-emerald-300': variant === 'success',
          'bg-amber-900/50 text-amber-300': variant === 'warning',
          'bg-red-900/50 text-red-300': variant === 'destructive',
          'border border-stone-600 text-stone-300 bg-transparent': variant === 'outline',
        },
        className,
      )}
    >
      {children}
    </span>
  )
}
