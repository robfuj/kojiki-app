'use client'

import { listDocuments } from '@/app/actions/documents'
import {
  getHomePayload,
  getProjectReport,
  listDepartmentWork,
  listProjectDecisions,
} from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import { ReportsSection } from '@/components/workspace/reports-section'
import { Sparkline } from '@/components/workspace/sparkline'
import {
  AvatarCircle,
  Card,
  Eyebrow,
  ProgressBar,
  StatusPill,
  departmentIcon,
  toneForStatus,
  useRelativeTime,
} from '@/components/workspace/ui/primitives'
import { format } from '@/lib/i18n'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

interface OverviewTabProps {
  projectId: string
  projectName: string
  projectObjective: string | null
  onOpenWork: () => void
  onOpenDecisions: () => void
  onChatWithBot: (botId: string) => void
}

/**
 * The project's front page: where the whole effort stands, the organisation
 * carrying it, the decisions just made, and the numbers behind all three.
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
  const [reportOpen, setReportOpen] = useState(false)

  const { data: home } = useSWR(['home', projectId], () =>
    getHomePayload(projectId),
  )
  const { data: departments } = useSWR(['departments', projectId], () =>
    listDepartmentWork(projectId),
  )
  const { data: decisions } = useSWR(['decisions', projectId], () =>
    listProjectDecisions(projectId),
  )
  const { data: report } = useSWR(['report', projectId], () =>
    getProjectReport(projectId),
  )
  const { data: documents } = useSWR(['documents', projectId], () =>
    listDocuments(projectId),
  )

  const overall = home?.root?.progress ?? report?.averageProgress ?? 0
  const gatesPending = report?.gatesPending ?? 0
  const botName = (botId: string | null) =>
    departments?.find((dept) => dept.botId === botId)?.displayName ?? '—'
  const signalTotal = report
    ? Object.values(report.signalsByKind).reduce((sum, n) => sum + n, 0)
    : 0
  const activeDepartments =
    departments?.filter((dept) => dept.objectives.length > 0).length ?? 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-6 py-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>{labels.eyebrow}</Eyebrow>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance text-foreground">
              {projectName}
            </h1>
            {projectObjective && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground">
                {projectObjective}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenWork}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            {labels.viewDetails}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5">
          <ProgressBar value={overall} className="max-w-md" />
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {format(labels.overallProgress, { percent: overall })}
            </p>
            <StatusPill tone="approved">{labels.active}</StatusPill>
            <StatusPill tone={gatesPending > 0 ? 'review' : 'idle'}>
              {gatesPending === 1
                ? labels.gate
                : format(labels.gates, { count: gatesPending })}
            </StatusPill>
            {home?.root && home.root.history.length > 1 && (
              <Sparkline
                values={home.root.history.map((point) => point.progress)}
                className="h-6 w-24 text-seal"
              />
            )}
          </div>
        </div>
      </Card>

      <section aria-label={labels.organization}>
        <h2 className="text-sm font-medium text-foreground">
          {labels.organization}
        </h2>
        {departments && departments.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {departments.map((dept) => {
              const Icon = departmentIcon(dept.specialistKey)
              const progress =
                dept.objectives.length === 0
                  ? 0
                  : Math.round(
                      dept.objectives.reduce(
                        (sum, objective) => sum + objective.progress,
                        0,
                      ) / dept.objectives.length,
                    )

              return (
                <Card key={dept.botId} className="flex flex-col p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="size-4 text-foreground" aria-hidden="true" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {dept.displayName}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {progress}%
                    </p>
                  </div>
                  <ProgressBar value={progress} className="mt-3" />
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {dept.mandate ?? dept.functionLine}
                  </p>
                  <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                    <AvatarCircle name={dept.displayName} className="size-6" />
                    <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {dept.displayName}
                    </p>
                    <button
                      type="button"
                      onClick={() => onChatWithBot(dept.botId)}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {labels.chat}
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {labels.emptyDepartments}
          </p>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">
              {labels.recentDecisions}
            </h2>
            <button
              type="button"
              onClick={onOpenDecisions}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.tabs.decisions.all}
              <ChevronRight className="size-3" aria-hidden="true" />
            </button>
          </div>
          {decisions && decisions.length > 0 ? (
            <ul className="divide-y divide-border">
              {decisions.slice(0, 5).map((decision) => (
                <li key={decision.id}>
                  <button
                    type="button"
                    onClick={onOpenDecisions}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
                      {decision.id.slice(0, 8)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {decision.title}
                    </span>
                    <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground sm:block">
                      {botName(decision.botId)}
                    </span>
                    <StatusPill tone={toneForStatus(decision.status)}>
                      {t.tabs.decisions.statuses[
                        decision.status as 'proposed' | 'accepted' | 'rejected'
                      ] ?? t.tabs.decisions.statuses.other}
                    </StatusPill>
                    <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                      {relative(decision.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {t.tabs.decisions.none}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-medium text-foreground">
            {labels.keyMetrics}
          </h2>
          <dl className="mt-3 space-y-2.5">
            <MetricRow
              label={labels.totalDecisions}
              value={String(decisions?.length ?? 0)}
            />
            <MetricRow
              label={labels.departmentsActive}
              value={`${activeDepartments} / ${departments?.length ?? 0}`}
            />
            <MetricRow
              label={labels.evidenceItems}
              value={String(documents?.length ?? 0)}
            />
            <MetricRow label={labels.signals} value={String(signalTotal)} />
          </dl>
          <button
            type="button"
            onClick={() => setReportOpen((v) => !v)}
            aria-expanded={reportOpen}
            className="mt-4 text-xs font-medium text-seal transition-opacity hover:opacity-80"
          >
            {reportOpen ? labels.hideReport : labels.fullReport}
          </button>
        </Card>
      </div>

      {reportOpen && report && <ReportsSection report={report} />}
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  )
}
