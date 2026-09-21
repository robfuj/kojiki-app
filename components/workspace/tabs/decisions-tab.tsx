'use client'

import { getProjectWorkspace } from '@/app/actions/projects'
import { decideGateRequest } from '@/app/actions/tasks'
import {
  listProjectDecisions,
  listProjectGates,
  type DecisionRow,
} from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import {
  Card,
  StatusPill,
  toneForStatus,
  useRelativeTime,
  type PillTone,
} from '@/components/workspace/ui/primitives'
import { cn } from '@/lib/utils'
import { Check, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'

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
 * The decision ledger: what every department decided, what is still waiting on
 * the user, and a reading panel for the selected row.
 */
export function DecisionsTab({ projectId, query }: DecisionsTabProps) {
  const { t } = useLocale()
  const labels = t.tabs.decisions
  const relative = useRelativeTime()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<string | null>(null)

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
    botId
      ? (workspace?.bots.find((bot) => bot.id === botId)?.displayName ?? '—')
      : t.tabs.orchestrator.brand

  const needle = `${query} ${search}`.trim().toLowerCase()
  const rows = useMemo(() => {
    const all = decisions ?? []
    return all.filter((decision) => {
      if (filter !== 'all' && filterOf(decision.status) !== filter) return false
      if (!needle) return true
      return `${decision.title} ${decision.stage} ${botName(decision.botId)}`
        .toLowerCase()
        .includes(needle)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions, filter, needle, workspace])

  const selected: DecisionRow | null =
    rows.find((row) => row.id === selectedId) ??
    (decisions ?? []).find((row) => row.id === selectedId) ??
    null

  const pending = (gates ?? []).filter((gate) => gate.status === 'pending')

  async function decide(gateId: string, decision: 'approved' | 'denied') {
    setDeciding(gateId)
    try {
      await decideGateRequest({ gateRequestId: gateId, decision })
      await mutate(['gates', projectId])
      await mutate(['decisions', projectId])
    } finally {
      setDeciding(null)
    }
  }

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

      {pending.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-foreground">
            {labels.awaiting}
          </h2>
          <ul className="mt-3 space-y-2">
            {pending.map((gate) => (
              <li
                key={gate.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-status-review/30 bg-status-review-soft/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {gate.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {gate.requestedByTitle} · {relative(gate.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={deciding === gate.id}
                  onClick={() => decide(gate.id, 'approved')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-status-approved px-3 py-1.5 text-xs font-medium text-status-approved-soft transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  {labels.approved}
                </button>
                <button
                  type="button"
                  disabled={deciding === gate.id}
                  onClick={() => decide(gate.id, 'denied')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  {labels.archived}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card className="self-start">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-1">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  aria-pressed={filter === item.key}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    filter === item.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="relative ml-auto">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <label htmlFor="decisions-search" className="sr-only">
                {labels.search}
              </label>
              <input
                id="decisions-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={labels.search}
                className="h-8 w-40 rounded-full border border-border bg-background pr-3 pl-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-seal/50"
              />
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              {labels.none}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((decision) => (
                <li key={decision.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(decision.id)}
                    aria-current={selectedId === decision.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      selectedId === decision.id
                        ? 'bg-muted/70'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
                      {decision.id.slice(0, 6)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {decision.title}
                    </span>
                    <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground sm:block">
                      {botName(decision.botId)}
                    </span>
                    <StatusPill tone={toneForStatus(decision.status)}>
                      {statusLabel(decision.status, labels)}
                    </StatusPill>
                    <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                      {relative(decision.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="self-start p-4">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-[11px] text-muted-foreground">
                  {selected.id.slice(0, 8)}
                </p>
                <StatusPill tone={toneForStatus(selected.status)}>
                  {statusLabel(selected.status, labels)}
                </StatusPill>
              </div>
              <h2 className="mt-2 text-base font-semibold text-balance text-foreground">
                {selected.title}
              </h2>
              <dl className="mt-4 space-y-2.5 text-xs">
                <DetailRow label={labels.department} value={botName(selected.botId)} />
                <DetailRow label={labels.stage} value={selected.stage} />
                <DetailRow
                  label={labels.source}
                  value={String(
                    (selected.payload as { source?: string } | null)?.source ?? '—',
                  )}
                />
                <DetailRow label={labels.updated} value={relative(selected.createdAt)} />
              </dl>
              <div className="mt-4 border-t border-border pt-3">
                <h3 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {labels.summary}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-pretty text-foreground">
                  {selected.summary ?? '—'}
                </p>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {labels.empty}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

function statusLabel(
  status: string,
  labels: {
    statuses: { proposed: string; accepted: string; rejected: string; other: string }
  },
): string {
  return (
    labels.statuses[status as 'proposed' | 'accepted' | 'rejected'] ??
    labels.statuses.other
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  )
}

export type { PillTone }
