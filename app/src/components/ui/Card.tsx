import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-hairline bg-surface-1 p-6 ${className}`}>{children}</div>
  )
}
