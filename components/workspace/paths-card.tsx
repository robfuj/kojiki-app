'use client'

import { getProjectPaths } from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import { Card, useRelativeTime } from '@/components/workspace/ui/primitives'
import { format } from '@/lib/i18n'
import { Route } from 'lucide-react'
import useSWR from 'swr'

interface PathsCardProps {
  projectId: string
}

/**
 * The mycelium made visible: every reinforced path between this project's
 * agents, heaviest first. A path is the engine's memory of who talks to whom —
 * weight grows with every exchange, so the card shows where the organisation
 * actually routes its work.
 */
export function PathsCard({ projectId }: PathsCardProps) {
  const { t } = useLocale()
  const relative = useRelativeTime()

  const { data: paths } = useSWR(['paths', projectId], () =>
    getProjectPaths(projectId),
  )

  const rows = [...(paths ?? [])].sort(
    (a, b) => Number(b.weight) - Number(a.weight),
  )

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Route className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-medium text-foreground">{t.paths.title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
          {t.paths.empty}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((path) => (
            <li
              key={path.id}
              className="rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <p className="font-mono text-[11px] text-foreground">
                {path.fromAgent}
                <span className="mx-1.5 text-muted-foreground" aria-hidden="true">
                  →
                </span>
                {path.toAgent}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {format(t.paths.exchanges, {
                  reciprocal: path.reciprocalExchanges,
                  one: path.oneDirectionalExchanges,
                })}
                {path.lastReinforced
                  ? ` · ${relative(path.lastReinforced)}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
