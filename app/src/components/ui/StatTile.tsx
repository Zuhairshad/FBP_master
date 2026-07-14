import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export function StatTile({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string
  value: string | number
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border border-hairline bg-surface-1 p-4', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
    </div>
  )
}
