import type { TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { cn } from '../../lib/utils'

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-hairline bg-surface-2', className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 text-sm text-ink-muted', className)} {...props} />
}

/**
 * A table row that optionally navigates on click. `to` renders a real
 * keyboard/cmd-click-accessible `<Link>` around the first cell's content
 * (pass it as `linkLabel`) and also makes the whole row clickable — a click
 * anywhere in the row navigates unless it originated inside a nested
 * interactive element (a trailing Delete/Approve button keeps working
 * independently).
 */
export function TableRow({
  className,
  to,
  onClick,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { to?: string }) {
  const navigate = useNavigate()

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    onClick?.(event)
    if (!to) return
    const target = event.target as HTMLElement
    if (target.closest('button, a')) return
    navigate(to)
  }

  return (
    <tr
      onClick={to ? handleClick : onClick}
      className={cn(
        'border-b border-hairline-tertiary last:border-b-0',
        to && 'cursor-pointer hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  )
}

/** Renders `children` as a real `<Link to={to}>` — use inside a `TableRow`'s
 * primary cell so the row is both keyboard/cmd-click accessible and visually
 * the obvious click target. */
export function TableRowLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cn('font-medium text-ink hover:text-primary', className)}>
      {children}
    </Link>
  )
}
