'use client'

import {
  listProjectDecisions,
  listProjectGates,
  type DecisionRow,
} from '@/app/actions/workspace'
import { getProjectWorkspace } from '@/app/actions/projects'
import { useLocale } from '@/components/i18n/locale-provider'
import { GateCard } from '@/components/workspace/gate-card'
import {
  Card,
  Eyebrow,
  StatusPill,
  toneForStatus,
  useRelativeTime,
} from '@/components/workspace/ui/primitives'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'

type Filter = 'all' | 'review' | 'approved' | 'archived'

function filterOf(status: string): Filter {
  if (status === 'proposed') return 'review'
  if (status === 'accepted') return 'approved'
  return 'archived'
}

interface DecisionsTabProps {
  projectId: string
  query: string
}

/**
 * Every decision the organisation has recorded, with the gates still waiting on
 * a human underneath — the two places a decision enters or leaves the ledger.
 */
export function DecisionsTab({ projectId, query }: DecisionsTabProps) {
  const { t } = useLocale()
  const labels = t.tabs.decisions
  const relative = useRelativeTime()
  const { mutate } = useSWRConfig()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: decisions } = useSWR(['decisions', projectId], () =>
    listProjectDecisions(projectId),
  )
  const { data: gates } = useSWR(['gates', projectId], () =>
    listProjectGates(projectId),
  )
  const { data: workspace } = useSWR(['workspace', projectId], () =>
    getProjectWorkspace(projectId),
  )

  const botName = (botId: string | null) =>
    workspace?.bots.find((bot) => bot.id === botId)?.displayName ?? '—'

  const needle = query.trim().toLowerCase()
  const rows = (decisions ?? []).filter((decision) => {
    if (filter !== 'all' && filterOf(decision.status) !== filter) return false
    if (needle && !decision.title.toLowerCase().includes(needle)) return false
    return true
  })

  const selected: DecisionRow | null =
    rows.find((decision) => decision.id === selectedId) ??
    decisions?.find((decision) => decision.id === selectedId) ??
    null
  const pending = (gates ?? []).filter((gate) => gate.status === 'pending')

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: labels.all },
    { key: 'review', label: labels.review },
    { key: 'approved', label: labels.approved },
    { key: 'archived', label: labels.archived },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t.nav.decisions}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            aria-pressed={filter === item.key}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === item.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_22rem]">
        <Card>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {labels.none}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((decision) => {
                const active = decision.id === selectedId
                return (
                  <li key={decision.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(decision.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        active ? 'bg-muted/70' : 'hover:bg-muted/50',
                      )}
                    >
                      <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
                        {decision.id.slice(0, 8)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {decision.title}
                      </span>
                      <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground md:block">
                        {botName(decision.botId)}
                      </span>
                      <StatusPill tone={toneForStatus(decision.status)}>
                        {labels.statuses[
                          decision.status as 'proposed' | 'accepted' | 'rejected'
                        ] ?? labels.statuses.other}
                      </StatusPill>
                      <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                        {relative(decision.createdAt)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="self-start p-5">
          {selected ? (
            <>
              <Eyebrow>{selected.id.slice(0, 8)}</Eyebrow>
              <h2 className="mt-1.5 text-base font-semibold text-foreground">
                {selected.title}
              </h2>
              <p className="mt-3 text-xs text-muted-foreground">
                {selected.description}
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {labels.status}
                  </span>
                  <StatusPill tone={toneForStatus(selected.status)}>
                    {labels.statuses[
                      selected.status as 'proposed' | 'accepted' | 'rejected'
                    ] ?? labels.statuses.other}
                  </StatusPill>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {labels.owner}
                  </span>
                  <span className="text-xs text-foreground">
                    {botName(selected.botId)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {labels.created}
                  </span>
                  <span className="text-xs text-foreground">
                    {relative(selected.createdAt)}
                  </span>
                </div>
              </div>
              {pending.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-border pt-4">
                  <p className="text-xs font-medium text-foreground">
                    {labels.gates}
                  </p>
                  {pending.map((gate) => (
                    <GateCard key={gate.id} gate={gate} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {labels.selectDecision}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
