'use client'

import { getHomePayload, type ObjectiveSummary } from '@/app/actions/workspace'
import { Sparkline } from '@/components/workspace/sparkline'
import { cn } from '@/lib/utils'
import { Loader2, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

/**
 * The Home tab: the company objective at the top, the department objectives
 * beneath it as summary cards with their key results and progress sparklines,
 * and a search line that filters the cards. Asking a question hands off to the
 * Orchestrator tab, which owns the conversation.
 */

interface HomeTabProps {
  projectId: string
  onOpenOrchestrator: () => void
  onOpenObjective: (objectiveId: string) => void
}

const SUGGESTIONS = [
  'What should we focus on this week?',
  'Where are we blocked?',
  'Summarize progress for me',
]

const STATUS_STYLE: Record<string, string> = {
  complete: 'bg-seal-soft text-seal',
  in_progress: 'bg-sumi-soft text-sumi',
  active: 'bg-sumi-soft text-sumi',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        STATUS_STYLE[status] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-seal transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function KeyResultLines({ objective }: { objective: ObjectiveSummary }) {
  if (objective.keyResults.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        No key results fixed yet
      </p>
    )
  }

  return (
    <ul className="space-y-1">
      {objective.keyResults.slice(0, 3).map((kr) => (
        <li
          key={`${kr.taskId}:${kr.metric}`}
          className="flex items-baseline justify-between gap-3 font-mono text-xs"
        >
          <span className="truncate text-muted-foreground">{kr.metric}</span>
          <span
            className={cn(
              'shrink-0',
              kr.met === null
                ? 'text-muted-foreground'
                : kr.met
                  ? 'text-seal'
                  : 'text-destructive',
            )}
          >
            {kr.actual === null ? '—' : kr.actual} / {kr.target}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function HomeTab({
  projectId,
  onOpenOrchestrator,
  onOpenObjective,
}: HomeTabProps) {
  const { data, isLoading } = useSWR(
    ['home', projectId],
    () => getHomePayload(projectId),
    { revalidateOnFocus: false },
  )
  const [query, setQuery] = useState('')

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center gap-2 p-10">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-xs text-muted-foreground">Loading workspace…</p>
      </div>
    )
  }

  const { root, objectives } = data
  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? objectives.filter(
        (objective) =>
          objective.title.toLowerCase().includes(needle) ||
          (objective.ownerName ?? '').toLowerCase().includes(needle),
      )
    : objectives

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      {/* Search — filters the department objective cards below. */}
      <section aria-label="Search objectives">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search objectives and departments…"
            aria-label="Search objectives and departments"
            className="w-full rounded-full border border-border bg-card py-3 pr-4 pl-11 text-sm text-foreground placeholder:text-muted-foreground focus:border-sumi focus:outline-none"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={onOpenOrchestrator}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      {/* Company objective — the root of the OKR tree. */}
      {root && (
        <section className="mt-8" aria-labelledby="company-objective-heading">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Company objective
          </p>
          <div className="mt-3 rounded-3xl border border-border bg-card p-6 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2
                  id="company-objective-heading"
                  className="font-serif text-2xl text-balance text-foreground"
                >
                  {root.title}
                </h2>
                {root.description && (
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {root.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenOrchestrator}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sumi px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                Orchestrator
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="min-w-40 flex-1">
                <ProgressBar value={root.progress} />
              </div>
              <span className="font-mono text-sm text-foreground">{root.progress}%</span>
              <StatusPill status={root.status} />
              {root.timeframe && (
                <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
                  {root.timeframe}
                </span>
              )}
              <Sparkline
                points={root.history.map((point) => point.progress)}
                className="h-7 w-28 text-seal"
              />
            </div>
          </div>
        </section>
      )}

      {/* Departmental objectives. */}
      <section className="mt-8" aria-labelledby="department-objectives-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="department-objectives-heading"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            Departmental objectives · {filtered.length}
          </h2>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {objectives.length === 0
              ? 'No departmental objectives yet. Open the OKRs tab and let the department heads decompose the company objective.'
              : 'No objectives match that search.'}
          </p>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {filtered.map((objective) => (
              <button
                key={objective.id}
                type="button"
                onClick={() => onOpenObjective(objective.id)}
                className="rounded-3xl border border-border bg-card p-5 text-left shadow-soft transition-colors hover:border-sumi/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-base font-medium text-balance text-foreground">
                    {objective.title}
                  </h3>
                  <StatusPill status={objective.status} />
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {objective.ownerName ?? 'Unassigned'}
                  {objective.timeframe ? ` · ${objective.timeframe}` : ''}
                </p>

                <div className="mt-4">
                  <KeyResultLines objective={objective} />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <ProgressBar value={objective.progress} />
                  </div>
                  <span className="font-mono text-xs text-foreground">
                    {objective.progress}%
                  </span>
                  <Sparkline
                    points={objective.history.map((point) => point.progress)}
                    className="h-6 w-20 shrink-0 text-seal"
                  />
                </div>

                <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                  {objective.taskCount} task{objective.taskCount === 1 ? '' : 's'} ·{' '}
                  {objective.doneTaskCount} done
                </p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
