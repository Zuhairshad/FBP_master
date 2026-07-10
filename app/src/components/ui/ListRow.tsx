import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function ListRow({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border border-hairline bg-surface-1 px-4 py-3 text-sm transition-colors hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  )
}
