'use client'

import {
  getHomePayload,
  getProjectReport,
  listDepartmentWork,
  listProjectGates,
} from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import {
  AvatarCircle,
  Card,
  ProgressBar,
  StatusPill,
  toneForStatus,
  useRelativeTime,
} from '@/components/workspace/ui/primitives'
import { format } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Coins, ListChecks, Scale, Target } from 'lucide-react'
import useSWR from 'swr'

interface OverviewTabProps {
  projectId: string
  projectName: string
  projectObjective: string | null
  onOpenWork: () => void
  onOpenDecisions: () => void
  onChatWithBot: (botId: string) => void
}

const DOT_TONE: Record<string, string> = {
  progress: 'bg-status-progress',
  review: 'bg-status-review',
  approved: 'bg-status-approved',
  idle: 'bg-status-idle',
}

const BUBBLE_TONES = [
  'bg-primary/15 text-primary',
  'bg-status-review-soft text-status-review',
  'bg-status-approved-soft text-status-approved',
  'bg-status-progress-soft text-status-progress',
]

const CLOSED_TASK_STATUSES = ['done', 'completed', 'cancelled', 'failed']

/**
 * The bento board: one stat strip, then an asymmetric grid — the live work
 * table, the stage load chart, the company objective on ink, department
 * bubbles and the gate queue.
 */
export function OverviewTab({
  projectId,
  projectName,
  projectObjective,
  onOpenWork,
  onOpenDecisions,
  onChatWithBot,
}: OverviewTabProps) {
  const { t } = useLocale()
  const labels = t.tabs.overview
  const relative = useRelativeTime()

  const { data: home } = useSWR(['home', projectId], () =>
    getHomePayload(projectId),
  )
  const { data: report } = useSWR(['report', projectId], () =>
    getProjectReport(projectId),
  )
  const { data: gates } = useSWR(['gates', projectId], () =>
    listProjectGates(projectId),
  )
  const { data: departments } = useSWR(['departments', projectId], () =>
    listDepartmentWork(projectId),
  )

  if (!home || !report) {
    return (
      <div className="space-y-4 px-6 py-6">
        <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-2xl bg-muted/60 lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-2xl bg-muted/60" />
        </div>
      </div>
    )
  }

  const pendingGates = (gates ?? []).filter((gate) => gate.status === 'pending')
  const doneTasks = report.tasksByStatus.done ?? 0
  const stages = Object.entries(report.tasksByStatus).filter(
    ([, count]) => count > 0,
  )
  const maxStage = Math.max(1, ...stages.map(([, count]) => count))
  const objectives = home.objectives.filter((objective) => !objective.isRoot)

  const bubbles = (departments ?? []).map((department) => {
    const open = department.tasks.filter(
      (task) => !CLOSED_TASK_STATUSES.includes(task.status),
    ).length
    return { ...department, open }
  })
  const maxOpen = Math.max(1, ...bubbles.map((bubble) => bubble.open))

  return (
    <div className="space-y-4 px-6 py-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
            {projectName}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {projectObjective ?? ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenWork}
          className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {labels.viewDetails}
        </button>
      </div>

      <Card className="grid grid-cols-2 divide-y divide-border overflow-hidden p-0 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        <StatCell
          icon={Target}
          label={labels.objectives}
          value={String(report.objectiveCount)}
          sub={format(labels.rootProgress, {
            percent: String(report.rootProgress ?? 0),
          })}
        />
        <StatCell
          icon={ListChecks}
          label={labels.tasks}
          value={String(report.taskCount)}
          sub={format(labels.done, { count: String(doneTasks) })}
        />
        <StatCell
          icon={Scale}
          label={labels.gateQueue}
          value={String(report.gatesPending)}
          sub={format(labels.decided, { count: String(report.gatesDecided) })}
        />
        <StatCell
          icon={Coins}
          label={labels.spend}
          value={`$${report.totalCostUsd.toFixed(2)}`}
          sub={format(labels.tokens, {
            count: `${(report.totalTokens / 1000).toFixed(1)}k`,
          })}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-0 lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-sm font-medium text-foreground">{labels.liveWork}</p>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {objectives.length}
            </span>
          </div>
          {objectives.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-muted-foreground">
              {labels.emptyDepartments}
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {objectives.slice(0, 7).map((objective) => (
                <li
                  key={objective.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      DOT_TONE[toneForStatus(objective.status)],
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {objective.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {objective.ownerName ?? '—'}
                    </p>
                  </div>
                  <div className="hidden w-24 shrink-0 sm:block">
                    <ProgressBar value={objective.progress} />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {objective.progress}%
                  </span>
                  <span className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground md:block">
                    {format(labels.tasksDone, {
                      done: String(objective.doneTaskCount),
                      total: String(objective.taskCount),
                    })}
                  </span>
                  <StatusPill tone={toneForStatus(objective.status)}>
                    {objective.status.replace(/_/g, ' ')}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium text-foreground">{labels.stageLoad}</p>
          {stages.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{labels.noGates}</p>
          ) : (
            <div className="mt-5 flex h-36 items-end gap-2">
              {stages.map(([status, count]) => (
                <div
                  key={status}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                >
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                  <div
                    className={cn(
                      'w-full rounded-full',
                      count === maxStage ? 'bg-primary' : 'bg-muted',
                    )}
                    style={{ height: `${Math.max(8, (count / maxStage) * 100)}%` }}
                  />
                  <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                    {status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="rounded-2xl bg-foreground p-5 text-background shadow-soft">
          <p className="text-[11px] font-medium tracking-[0.14em] text-background/60 uppercase">
            {labels.companyObjective}
          </p>
          <p className="mt-2.5 text-lg leading-snug font-semibold text-balance">
            {home.root?.title ?? projectObjective ?? '—'}
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-background/20">
            <div
              className="h-full rounded-full bg-background"
              style={{ width: `${home.root?.progress ?? 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-background/70">
            {format(labels.overallProgress, {
              percent: String(home.root?.progress ?? report.averageProgress),
            })}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {Object.entries(report.objectivesByStatus)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <span
                  key={status}
                  className="rounded-full bg-background/10 px-2 py-0.5 text-[10px] font-medium tabular-nums"
                >
                  {status.replace(/_/g, ' ')} · {count}
                </span>
              ))}
          </div>
        </div>

        <Card className="p-5">
          <p className="text-sm font-medium text-foreground">
            {labels.departmentLoad}
          </p>
          {bubbles.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {labels.emptyDepartments}
            </p>
          ) : (
            <>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                {bubbles.map((bubble, index) => {
                  const size = 56 + Math.round((bubble.open / maxOpen) * 64)
                  return (
                    <button
                      key={bubble.botId}
                      type="button"
                      onClick={() => onChatWithBot(bubble.botId)}
                      title={bubble.displayName}
                      aria-label={bubble.displayName}
                      style={{ width: size, height: size }}
                      className={cn(
                        'flex items-center justify-center rounded-full transition-transform hover:scale-105',
                        BUBBLE_TONES[index % BUBBLE_TONES.length],
                      )}
                    >
                      <span className="text-sm font-semibold tabular-nums">
                        {bubble.open}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {bubbles.map((bubble, index) => (
                  <span
                    key={bubble.botId}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      BUBBLE_TONES[index % BUBBLE_TONES.length],
                    )}
                  >
                    {bubble.displayName}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-sm font-medium text-foreground">{labels.gateQueue}</p>
            <span className="rounded-full bg-status-review-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-status-review">
              {pendingGates.length}
            </span>
          </div>
          {pendingGates.length === 0 ? (
            <p className="border-t border-border px-5 py-6 text-sm text-muted-foreground">
              {labels.noGates}
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {pendingGates.slice(0, 5).map((gate) => (
                <li key={gate.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-review-soft text-status-review">
                    <Scale className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {gate.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {gate.requestedByTitle} · {relative(gate.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenDecisions}
                    className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-seal/40 hover:text-foreground"
                  >
                    {labels.viewDetails}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex items-center gap-4 p-5">
          <AvatarCircle name={projectName} className="size-12 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{labels.active}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {format(labels.gates, { count: String(report.gatesPending) })} ·{' '}
              {format(labels.signals, {})}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function StatCell({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Target
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-0.5 truncate text-xl font-semibold tabular-nums text-foreground">
          {value}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}
