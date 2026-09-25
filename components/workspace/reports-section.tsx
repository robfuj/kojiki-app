'use client'

import type { ProjectReport } from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import { Card } from '@/components/workspace/ui/primitives'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface ReportsSectionProps {
  report: ProjectReport
}

/**
 * The full report behind the Overview's key metrics: the objective's progress
 * over time, how tasks landed, what each department spent, and the traffic the
 * mycelium carried.
 */
export function ReportsSection({ report }: ReportsSectionProps) {
  const { t } = useLocale()
  const labels = t.tabs.overview

  const history = report.progressHistory.map((point, index) => ({
    index,
    progress: point.progress,
  }))

  const verdicts = Object.entries(report.tasksByVerdict)
  const signals = Object.entries(report.signalsByKind)

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="p-4">
        <h3 className="text-sm font-medium text-foreground">
          {formatPercentHeader(report)}
        </h3>
        {history.length > 1 ? (
          <div className="mt-3 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="progress-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--seal)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--seal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="progress"
                  stroke="var(--seal)"
                  strokeWidth={1.5}
                  fill="url(#progress-fill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-dashed border-border px-3 py-6 text-xs text-muted-foreground">
            {labels.overallProgress.replace('{percent}', String(report.averageProgress))}
          </p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Stat label={t.tabs.work.status} value={String(report.taskCount)} />
          <Stat
            label={labels.gates.replace('{count}', String(report.gatesPending))}
            value={String(report.gatesDecided)}
          />
          <Stat label="Cost" value={`$${report.totalCostUsd.toFixed(2)}`} />
          <Stat label="Tokens" value={report.totalTokens.toLocaleString()} />
        </dl>
      </Card>

      <div className="space-y-3">
        <Card className="p-4">
          <h3 className="text-sm font-medium text-foreground">
            {t.tabs.work.keyResults}
          </h3>
          <ul className="mt-2.5 space-y-1.5">
            {verdicts.length === 0 ? (
              <li className="text-xs text-muted-foreground">—</li>
            ) : (
              verdicts.map(([verdict, count]) => (
                <li key={verdict} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {verdict}
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted" style={{ width: '8rem' }}>
                    <span
                      className="block h-full rounded-full bg-seal"
                      style={{
                        width: `${(count / report.taskCount) * 100 || 0}%`,
                      }}
                    />
                  </span>
                  <span className="w-8 text-right tabular-nums text-foreground">
                    {count}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-medium text-foreground">
            {t.nav.departments}
          </h3>
          <ul className="mt-2.5 divide-y divide-border">
            {report.perDepartment.map((line) => (
              <li key={line.displayName} className="flex items-center gap-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {line.displayName}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {line.passCount}/{line.taskCount}
                </span>
                <span className="w-16 text-right tabular-nums text-muted-foreground">
                  ${line.costUsd.toFixed(2)}
                </span>
              </li>
            ))}
            {report.perDepartment.length === 0 && (
              <li className="py-1.5 text-xs text-muted-foreground">—</li>
            )}
          </ul>
        </Card>

        {signals.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-medium text-foreground">
              {labels.signals}
            </h3>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {signals.map(([kind, count]) => (
                <span
                  key={kind}
                  className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground"
                >
                  {kind} · {count}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function formatPercentHeader(report: ProjectReport): string {
  return `${report.rootProgress ?? report.averageProgress}%`
}
