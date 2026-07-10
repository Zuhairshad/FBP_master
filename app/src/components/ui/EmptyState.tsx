import { Inbox } from 'lucide-react'

export function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-hairline px-4 py-8 text-center">
      <Inbox className="size-5 text-ink-tertiary" />
      <p className="text-sm text-ink-subtle">{children}</p>
    </div>
  )
}
