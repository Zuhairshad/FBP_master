import { useId, type InputHTMLAttributes } from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '../../lib/utils'

export function TextField({
  label,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      <LabelPrimitive.Root htmlFor={inputId} className="text-sm text-ink">
        {label}
      </LabelPrimitive.Root>
      <input
        id={inputId}
        {...props}
        className={cn(
          'w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-hairline-strong focus:ring-2 focus:ring-primary-focus/50',
          className,
        )}
      />
    </div>
  )
}
