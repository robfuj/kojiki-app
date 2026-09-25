'use client'

import type { KeyResultRow } from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import { StatusPill } from '@/components/workspace/ui/primitives'

const OPERATOR_GLYPH: Record<string, string> = {
  gte: '≥',
  lte: '≤',
  gt: '>',
  lt: '<',
  eq: '=',
}

/**
 * The measured half of an objective: every success criterion on its tasks, with
 * the target it was set against and the value Check actually recorded.
 */
export function KeyResultsTable({ rows }: { rows: KeyResultRow[] }) {
  const { t } = useLocale()
  const labels = t.tabs.work

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        {labels.krEmpty}
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-2.5 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {labels.metric}
            </th>
            <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {labels.target}
            </th>
            <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {labels.actual}
            </th>
            <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {labels.status}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr key={`${row.taskId}-${row.metric}-${index}`}>
              <td className="px-4 py-2.5">
                <p className="font-medium text-foreground">{row.metric}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.taskTitle}
                </p>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                {OPERATOR_GLYPH[row.operator] ?? '≥'} {row.target}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                {row.actual ?? '—'}
              </td>
              <td className="px-4 py-2.5 text-right">
                <StatusPill
                  tone={row.met === null ? 'idle' : row.met ? 'approved' : 'review'}
                >
                  {row.met === null
                    ? labels.pending
                    : row.met
                      ? labels.met
                      : labels.unmet}
                </StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
