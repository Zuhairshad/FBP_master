import type { ReactNode } from 'react'

export function ListRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <li className={`flex items-center justify-between rounded-md border border-hairline bg-surface-1 px-4 py-3 text-sm ${className}`}>
      {children}
    </li>
  )
}
