import type { TaskRow } from '@/app/actions/tasks'
import { cn } from '@/lib/utils'

/**
 * The Key Results table for one objective: every success criterion fixed before
 * dispatch, with the actual measured against it. The criteria come from the
 * tasks' Plan phase, so the table is a comparison rather than a claim — the same
 * integrity property the task card carries, aggregated to the objective.
 */

interface Criterion {
  metric: string
  target: number | string
  operator: string
  weight?: number
}

const OPERATOR_LABEL: Record<string, string> = {
  gte: '≥',
  lte: '≤',
  gt: '>',
  lt: '<',
  eq: '=',
}

interface ResultRow {
  key: string
  metric: string
  target: number
  operator: string
  actual: number | null
  met: boolean | null
  owner: string
}

function meets(operator: string, actual: number, target: number): boolean {
  switch (operator) {
    case 'lte':
      return actual <= target
    case 'gt':
      return actual > target
    case 'lt':
      return actual < target
    case 'eq':
      return actual === target
    default:
      return actual >= target
  }
}

export function KeyResultsTable({ tasks }: { tasks: TaskRow[] }) {
  const rows: ResultRow[] = tasks.flatMap((task) => {
    const criteria = (task.successCriteria ?? []) as Criterion[]
    const direct = task.actuals as Record<string, number> | null
    const reported = (task.result ?? {}) as { actuals?: Record<string, number> }
    const actuals = direct ?? reported.actuals ?? {}

    return criteria.map((criterion) => {
      const target = Number(criterion.target)
      const actual = actuals[criterion.metric]
      return {
        key: `${task.id}:${criterion.metric}`,
        metric: criterion.metric,
        target,
        operator: criterion.operator,
        actual: actual === undefined ? null : actual,
        met:
          actual === undefined || Number.isNaN(target)
            ? null
            : meets(criterion.operator, actual, target),
        owner: task.subAgentTitle,
      }
    })
  })

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No key results yet. When the department head dispatches work it fixes
        success criteria first, and they appear here as the measures of this
        objective.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-sidebar/60 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 font-normal">Key result</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Target</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Actual</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Status</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-b-0">
              <td className="px-4 py-2.5 font-medium text-foreground">{row.metric}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                {OPERATOR_LABEL[row.operator] ?? row.operator} {row.target}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                {row.actual === null ? '—' : row.actual}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    row.met === null
                      ? 'bg-muted text-muted-foreground'
                      : row.met
                        ? 'bg-seal-soft text-seal'
                        : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {row.met === null ? 'pending' : row.met ? 'met' : 'missed'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.owner}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
