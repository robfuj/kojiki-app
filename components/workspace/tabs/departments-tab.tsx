'use client'

import { listDepartmentWork, type DepartmentWork } from '@/app/actions/workspace'
import { MyceliumFeed } from '@/components/workspace/mycelium-feed'
import { cn } from '@/lib/utils'
import { Loader2, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

/**
 * The Departments tab: one card per department agent with the work it owns, and
 * a detail panel for the selected department showing its objectives, its
 * sub-agent tasks, and the Mycelium traffic it emitted.
 */

interface DepartmentsTabProps {
  projectId: string
  /** Focuses the sidebar conversation on this department head. */
  onTalkToDepartment: (botId: string) => void
}

const VERDICT_STYLE: Record<string, string> = {
  PASS: 'bg-seal-soft text-seal',
  LEARNING: 'bg-sumi-soft text-sumi',
  FAIL: 'bg-destructive/10 text-destructive',
}

function DepartmentCard({
  department,
  selected,
  onSelect,
}: {
  department: DepartmentWork
  selected: boolean
  onSelect: () => void
}) {
  const averageProgress =
    department.objectives.length === 0
      ? 0
      : Math.round(
          department.objectives.reduce((sum, o) => sum + o.progress, 0) /
            department.objectives.length,
        )

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      className={cn(
        'rounded-3xl border bg-card p-5 text-left shadow-soft transition-colors',
        selected ? 'border-sumi' : 'border-border hover:border-sumi/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-medium text-foreground">
            {department.displayName}
          </h3>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {department.functionLine}
          </p>
        </div>
        {department.pendingGates > 0 && (
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            {department.pendingGates} gate{department.pendingGates === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {department.mandate && (
        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {department.mandate}
        </p>
      )}

      <dl className="mt-4 flex gap-4 font-mono text-xs text-muted-foreground">
        <div>
          <dt className="sr-only">Objectives</dt>
          <dd>{department.objectives.length} objectives</dd>
        </div>
        <div>
          <dt className="sr-only">Tasks</dt>
          <dd>{department.tasks.length} tasks</dd>
        </div>
        <div>
          <dt className="sr-only">Average progress</dt>
          <dd className="text-foreground">{averageProgress}%</dd>
        </div>
      </dl>
    </button>
  )
}

function DepartmentDetail({
  department,
  onTalkToDepartment,
}: {
  department: DepartmentWork
  onTalkToDepartment: (botId: string) => void
}) {
  return (
    <section
      aria-label={`${department.displayName} detail`}
      className="rounded-3xl border border-border bg-card p-6 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-xl text-foreground">{department.displayName}</h3>
        <button
          type="button"
          onClick={() => onTalkToDepartment(department.botId)}
          className="inline-flex items-center gap-1.5 rounded-full bg-sumi px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <MessageSquare className="size-3.5" aria-hidden="true" />
          Talk to {department.displayName}
        </button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Objectives owned
          </h4>
          {department.objectives.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No objectives assigned to this department yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {department.objectives.map((objective) => (
                <li key={objective.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-foreground">
                      {objective.title}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {objective.progress}%
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={objective.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={objective.title}
                  >
                    <div
                      className="h-full rounded-full bg-seal"
                      style={{ width: `${objective.progress}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h4 className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Sub-agent tasks
          </h4>
          {department.tasks.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No work dispatched through this department yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {department.tasks.slice(0, 8).map((task) => (
                <li
                  key={task.id}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-foreground">{task.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {task.subAgentTitle}
                    </span>
                    {task.validationResult && (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 font-mono text-[10px]',
                          VERDICT_STYLE[task.validationResult] ??
                            'bg-muted text-muted-foreground',
                        )}
                      >
                        {task.validationResult}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Mycelium traffic
          </h4>
          <div className="mt-2">
            <MyceliumFeed signals={department.signals} />
          </div>
        </div>
      </div>
    </section>
  )
}

export function DepartmentsTab({ projectId, onTalkToDepartment }: DepartmentsTabProps) {
  const { data, isLoading } = useSWR(
    ['departments', projectId],
    () => listDepartmentWork(projectId),
    { revalidateOnFocus: false },
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center gap-2 p-10">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="font-mono text-xs text-muted-foreground">Loading departments…</p>
      </div>
    )
  }

  const selected = data.find((department) => department.botId === selectedId) ?? null

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Departments · {data.length}
        </p>
        <h2 className="mt-1.5 font-serif text-3xl text-balance text-foreground">
          The roster this project instantiated
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Each department head owns objectives, dispatches its sub-agents, and
          answers for what comes back. Select one to see its work.
        </p>
      </header>

      {data.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No department agents yet. Create a project and the orchestrator will
          select the roster the goal needs.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((department) => (
              <DepartmentCard
                key={department.botId}
                department={department}
                selected={department.botId === selectedId}
                onSelect={() =>
                  setSelectedId(
                    department.botId === selectedId ? null : department.botId,
                  )
                }
              />
            ))}
          </div>

          {selected && (
            <div className="mt-6">
              <DepartmentDetail
                department={selected}
                onTalkToDepartment={onTalkToDepartment}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
