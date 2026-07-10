import { useId, type ReactNode, type SelectHTMLAttributes } from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export function SelectField({
  label,
  children,
  id,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      <LabelPrimitive.Root htmlFor={selectId} className="text-sm text-ink">
        {label}
      </LabelPrimitive.Root>
      <div className="relative">
        <select
          id={selectId}
          {...props}
          className={cn(
            'w-full appearance-none rounded-md border border-hairline bg-surface-1 px-3 py-2 pr-8 text-sm text-ink outline-none focus:border-hairline-strong focus:ring-2 focus:ring-primary-focus/50',
            className,
          )}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
      </div>
    </div>
  )
}
