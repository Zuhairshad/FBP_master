import { AlertCircle } from 'lucide-react'

export function ErrorText({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-error">
      <AlertCircle className="size-4 shrink-0" />
      {children}
    </p>
  )
}
