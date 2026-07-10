type StatusTone = 'neutral' | 'success' | 'error'

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'text-ink-muted',
  success: 'text-success',
  error: 'text-error',
}

export function StatusBadge({ children, tone = 'neutral' }: { children: string; tone?: StatusTone }) {
  return (
    <span
      className={`rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium uppercase ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
