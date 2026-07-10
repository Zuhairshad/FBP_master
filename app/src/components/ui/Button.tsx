import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger'

// Not in the source design brief (a marketing page has no destructive
// actions) — same category of extension as the `error` semantic color in
// DESIGN.md. Its own variant, not a className override on `secondary`,
// because Tailwind's generated stylesheet order — not DOM class order —
// decides which same-property utility wins, so stacking a border/text color
// override on top of a variant's own border/text color is unreliable.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface-1 text-ink border border-hairline',
  tertiary: 'bg-canvas text-ink',
  danger: 'bg-surface-1 text-error border border-error/40',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`rounded-md px-3.5 py-2 text-sm font-medium disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    />
  )
}
