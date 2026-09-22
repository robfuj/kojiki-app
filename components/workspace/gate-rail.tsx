'use client'

import { listProjectGates } from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import { useRelativeTime } from '@/components/workspace/ui/primitives'
import { Scale } from 'lucide-react'
import useSWR from 'swr'

interface GateRailProps {
  projectId: string
  onOpenDecisions: () => void
}

/**
 * The right-hand gate queue: every pending decision gate stays visible next to
 * whatever view is open, so authority never hides behind a tab.
 */
export function GateRail({ projectId, onOpenDecisions }: GateRailProps) {
  const { t } = useLocale()
  const relative = useRelativeTime()

  const { data: gates } = useSWR(['gates', projectId], () =>
    listProjectGates(projectId),
  )
  const pending = (gates ?? []).filter((gate) => gate.status === 'pending')

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-card/50 lg:flex">
      <div className="flex items-center justify-between px-4 py-3.5">
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {t.tabs.decisions.awaiting}
        </p>
        <span className="rounded-full bg-status-review-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-status-review">
          {pending.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {t.tabs.overview.noGates}
          </p>
        ) : (
          pending.map((gate) => (
            <div
              key={gate.id}
              className="rounded-xl border border-border bg-card p-3 shadow-soft"
            >
              <p className="line-clamp-2 text-sm font-medium text-foreground">
                {gate.title}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {gate.requestedByTitle} · {relative(gate.createdAt)}
              </p>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-status-review-soft text-status-review">
                  <Scale className="size-3.5" aria-hidden="true" />
                </span>
                <button
                  type="button"
                  onClick={onOpenDecisions}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-seal/40 hover:text-foreground"
                >
                  {t.tabs.overview.viewDetails}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
