'use client'

import { getProjectReport } from '@/app/actions/workspace'
import { formatTokens, formatUsd } from '@/lib/cost'
import { Loader2 } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import useSWR from 'swr'

/**
 * The Reports tab: the project's numbers, aggregated server-side. Spend and
 * tokens are the provider's own usage figures, not estimates; the progress line
 * is drawn from the same history samples the Home sparklines use.
 */

interface ReportsTabProps {
  projectId: string
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-serif text-3xl text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function ReportsTab({ projectId }: ReportsTabProps) {
  const { data, isLoading } = useSWR(
    ['report', projectId],
    () => getProjectReport(projectId),
    { revalidateOnFocus: false },
  )

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center gap-2 p-10">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-xs text-muted-foreground">Compiling report…</p>
      </div>
    )
  }

  const verdictData = Object.entries(data.tasksByVerdict).map(([name, value]) => ({
    name,
    value,
  }))
  const departmentData = data.perDepartment.map((line) => ({
    name: line.displayName,
    tasks: line.taskCount,
    passed: line.passCount,
  }))
  const progressData = data.progressHistory.map((point) => ({
    label: new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(point.recordedAt),
    progress: point.progress,
  }))

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Reports
        </p>
        <h2 className="mt-1.5 font-serif text-3xl text-balance text-foreground">
          What the project has done and what it cost
        </h2>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Objectives"
          value={String(data.objectiveCount)}
          hint={`${data.averageProgress}% average progress`}
        />
        <StatCard
          label="Tasks"
          value={String(data.taskCount)}
          hint={
            data.tasksByVerdict.PASS
              ? `${data.tasksByVerdict.PASS} passed Check`
              : 'none checked yet'
          }
        />
        <StatCard
          label="Actual spend"
          value={formatUsd(data.totalCostUsd)}
          hint={`${formatTokens(data.totalTokens)} tokens consumed`}
        />
        <StatCard
          label="Governance"
          value={String(data.gatesPending)}
          hint={`${data.gatesPending} pending · ${data.gatesDecided} decided`}
        />
      </div>

      <section className="mt-8" aria-labelledby="progress-heading">
        <h3
          id="progress-heading"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          Company objective progress
        </h3>
        <div className="mt-3 rounded-3xl border border-border bg-card p-5 shadow-soft">
          {progressData.length < 2 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Not enough progress samples yet. The line appears as objectives
              start moving.
            </p>
          ) : (
            <div className="h-48 w-full text-seal">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    opacity={0.5}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    opacity={0.5}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="progress"
                    stroke="currentColor"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="departments-heading">
          <h3
            id="departments-heading"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            Tasks per department
          </h3>
          <div className="mt-3 rounded-3xl border border-border bg-card p-5 shadow-soft">
            {departmentData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No departments instantiated yet.
              </p>
            ) : (
              <div className="h-48 w-full text-sumi">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="currentColor"
                      opacity={0.5}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="tasks" fill="currentColor" opacity={0.35} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="passed" fill="currentColor" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="verdicts-heading">
          <h3
            id="verdicts-heading"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            Check verdicts · learnings
          </h3>
          <div className="mt-3 rounded-3xl border border-border bg-card p-5 shadow-soft">
            {verdictData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing has been through Check yet.
              </p>
            ) : (
              <div className="h-48 w-full text-sumi">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={verdictData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="currentColor" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {data.learningsCount} learning case{data.learningsCount === 1 ? '' : 's'} recorded ·{' '}
              {data.reusableLearningsCount} marked reusable
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
