import type { InputHTMLAttributes } from 'react'

export function TextField({
  label,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm text-ink">
      {label}
      <input
        {...props}
        className={`mt-1 w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-ink outline-none focus:border-hairline-strong focus:ring-2 focus:ring-primary-focus/50 ${className}`}
      />
    </label>
  )
}
