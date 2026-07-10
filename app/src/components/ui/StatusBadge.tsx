import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

type StatusTone = 'neutral' | 'success' | 'error'

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase', {
  variants: {
    tone: {
      neutral: 'bg-surface-2 text-ink-muted',
      success: 'bg-success/10 text-success',
      error: 'bg-error/10 text-error',
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
})

export function StatusBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: string
  tone?: StatusTone
  className?: string
}) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>
}
