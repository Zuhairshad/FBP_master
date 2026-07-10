import type { ReactNode, SelectHTMLAttributes } from 'react'

export function SelectField({
  label,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-ink">
      {label}
      <select
        {...props}
        className={`mt-1 w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-ink outline-none focus:border-hairline-strong focus:ring-2 focus:ring-primary-focus/50 ${className}`}
      >
        {children}
      </select>
    </label>
  )
}
