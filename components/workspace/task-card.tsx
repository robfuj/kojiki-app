'use client'

import {
  approveTaskModel,
  checkTask,
  escalateTask,
  reabsorbTask,
  runTask,
  type TaskRow,
} from '@/app/actions/tasks'
import {
  LEARNING_EXPLANATION,
  TASK_STATUS_LABELS,
  VALIDATION_LABELS,
  type ValidationResult,
} from '@/lib/agent-labels'
import { formatUsd } from '@/lib/cost'
import type { Guardrail, GuardrailBreach, SuccessCriterion } from '@/lib/kaizen'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Coins,
  GitBranch,
  Lightbulb,
  MessageSquare,
  Play,
  Scale,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { ActionButton, EscalationForm, ModelApproval } from '@/components/workspace/task-card-parts'

/**
 * One sub-agent task, rendered as the Kaizen cycle it actually went through.
 *
 * The card is ordered Plan → Do → Check → Act because that is the order the work
 * happened in, and the ordering carries the integrity property: the success
 * criteria are shown at the top, fixed before the work started, so the result
 * below them can be read as a comparison rather than a claim.
 */
interface TaskCardProps {
  task: TaskRow
  onChanged: () => void
  onTalkToSubAgent: (task: TaskRow) => void
}

const OPERATOR_LABEL: Record<string, string> = {
  gte: '≥',
  lte: '≤',
  gt: '>',
  lt: '<',
  eq: '=',
}

const VERDICT_TONE: Record<ValidationResult, string> = {
  PASS: 'border-seal/40 bg-seal-soft text-seal',
  LEARNING: 'border-sumi/40 bg-sumi-soft text-sumi',
  FAIL: 'border-destructive/40 bg-destructive/10 text-destructive',
}

const VERDICT_ICON: Record<ValidationResult, typeof CheckCircle2> = {
  PASS: CheckCircle2,
  LEARNING: Lightbulb,
  FAIL: XCircle,
}

const VERDICT_EXPLANATION: Record<ValidationResult, string> = {
  PASS: 'Every weighted criterion met, and no guardrail breached.',
  LEARNING: 'A target was missed, but the attempt produced a lesson worth carrying forward.',
  FAIL: 'A target was missed with no reusable lesson, or a guardrail was breached.',
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function TaskCard({ task, onChanged, onTalkToSubAgent }: TaskCardProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [escalating, setEscalating] = useState(false)
  const [open, setOpen] = useState(!task.reabsorbedAt)
  const detailsId = `task-details-${task.id}`

  const criteria = task.successCriteria as SuccessCriterion[]
  const guardrails = task.guardrails as Guardrail[]
  const result = (task.result ?? {}) as {
    actuals?: Record<string, number>
    blockedBy?: string | null
    learningCase?: string | null
  }
  // Check writes the measured values onto the task; before it runs they only exist
  // in what the sub-agent reported.
  const actuals =
    (task.actuals as Record<string, number> | null) ?? result.actuals ?? {}
  const breaches = task.guardrailBreaches as GuardrailBreach[]
  const verdict = task.validationResult as ValidationResult | null
  const blocked = task.status === 'blocked'
  const learningCase = result.learningCase ?? null

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That step could not complete')
    } finally {
      setBusy(false)
    }
  }

  const VerdictIcon = verdict ? VERDICT_ICON[verdict] : null

  return (
    <article
      className={cn(
        'rounded-2xl border bg-card shadow-soft',
        blocked ? 'border-seal/50' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h4 className="min-w-0 text-base font-medium text-balance text-foreground">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailsId}
            className="inline-flex items-center gap-1.5 text-left hover:text-sumi"
          >
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                !open && '-rotate-90',
              )}
              aria-hidden="true"
            />
            {task.title}
          </button>
        </h4>

        <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
          {task.subAgentTitle}
        </span>

        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            blocked
              ? 'bg-seal-soft text-seal'
              : task.status === 'reabsorbed'
                ? 'bg-seal-soft text-seal'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {TASK_STATUS_LABELS[task.status] ?? task.status}
        </span>

        {verdict && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
              VERDICT_TONE[verdict],
            )}
          >
            {VerdictIcon && <VerdictIcon className="size-3.5" aria-hidden="true" />}
            {VALIDATION_LABELS[verdict]} · {task.outcomeScore ?? 0}/100
          </span>
        )}

        <button
          type="button"
          onClick={() => onTalkToSubAgent(task)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
        >
          <MessageSquare className="size-3.5" aria-hidden="true" />
          Talk to {task.subAgentTitle}
        </button>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {open && (
        <div id={detailsId} className="space-y-4">
        {/* PLAN — criteria fixed before the work started. */}
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Targets · set before the work started
          </p>

          {criteria.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No criteria were recorded, so there is nothing to check against.
            </p>
          ) : (
            <table className="mt-2 w-full font-mono text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="pb-1 pr-3 font-normal">Metric</th>
                  <th scope="col" className="pb-1 pr-3 font-normal">Target</th>
                  <th scope="col" className="pb-1 pr-3 text-right font-normal">Actual</th>
                  <th scope="col" className="pb-1 text-right font-normal">
                    <abbr title="Weight in the score">Wt</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((criterion) => {
                  const actual = actuals[criterion.metric]
                  return (
                    <tr key={criterion.metric} className="border-t border-border">
                      <td className="py-1.5 pr-3 text-foreground">{criterion.metric}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {OPERATOR_LABEL[criterion.operator] ?? criterion.operator}{' '}
                        {criterion.target}
                        {criterion.unit ? ` ${criterion.unit}` : ''}
                      </td>
                      <td
                        className={cn(
                          'py-1.5 pr-3 text-right tabular-nums',
                          actual === undefined
                            ? 'text-muted-foreground'
                            : verdict === 'FAIL'
                              ? 'text-destructive'
                              : 'text-foreground',
                        )}
                      >
                        {actual ?? '—'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {criterion.weight}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {guardrails.length > 0 && (
            <ul className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
              {guardrails.map((guardrail) => (
                <li
                  key={guardrail.metric}
                  className="flex items-baseline gap-2 font-mono text-xs text-muted-foreground"
                >
                  <Scale className="size-3.5 shrink-0 text-seal" aria-hidden="true" />
                  <span>
                    {guardrail.metric} {OPERATOR_LABEL[guardrail.operator]}{' '}
                    {guardrail.limit}
                  </span>
                  {guardrail.note && (
                    <span className="text-muted-foreground/60">— {guardrail.note}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {task.measurementWindowDays !== null && (
            <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">
              measurement window {task.measurementWindowDays} day
              {task.measurementWindowDays === 1 ? '' : 's'}
            </p>
          )}
        </section>

        {/* The head proposed a model; nothing runs until the user authorises it. */}
        {task.status === 'proposed' && (
          <ModelApproval
            task={task}
            busy={busy}
            onApprove={(modelId) =>
              run(() => approveTaskModel({ taskId: task.id, modelId }))
            }
          />
        )}

        {/* DO — what the sub-agent reported. */}
        {task.resultSummary && (
          <section className="border-t border-border pt-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Result · from {task.subAgentTitle}
            </p>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {task.resultSummary}
            </p>
            {result.blockedBy && (
              <p className="mt-2.5 flex items-start gap-1.5 text-sm text-seal">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Blocked by: {result.blockedBy}
              </p>
            )}

            {(task.actualCostUsd !== null || task.estimatedCostUsd !== null) && (
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
                <Coins className="size-3.5 shrink-0 text-seal" aria-hidden="true" />
                {task.actualCostUsd !== null ? (
                  <>
                    <span className="text-foreground">
                      {formatUsd(task.actualCostUsd)} actual
                    </span>
                    {task.estimatedCostUsd !== null && (
                      <span>vs {formatUsd(task.estimatedCostUsd)} estimated</span>
                    )}
                    {task.actualInputTokens !== null &&
                      task.actualOutputTokens !== null && (
                        <span>
                          {task.actualInputTokens.toLocaleString()} in /{' '}
                          {task.actualOutputTokens.toLocaleString()} out
                        </span>
                      )}
                  </>
                ) : (
                  <span>estimated {formatUsd(task.estimatedCostUsd)}</span>
                )}
                {task.modelUsedId && <span>· {task.modelUsedId}</span>}
              </p>
            )}
          </section>
        )}

        {/* CHECK — the mechanical comparison. */}
        {verdict && (
          <section className="border-t border-border pt-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Verdict
            </p>

            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {VERDICT_EXPLANATION[verdict]} Scored {task.outcomeScore ?? 0}/100 by
              weight.
              {task.checkedAt && (
                <span className="text-muted-foreground/60">
                  {' '}
                  Checked {formatTimestamp(task.checkedAt)}.
                </span>
              )}
            </p>

            {breaches.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {breaches.map((breach) => (
                  <li
                    key={breach.metric}
                    className="flex items-start gap-1.5 text-sm text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Guardrail breached: {breach.metric} came in at {breach.actual},
                      beyond the limit of {breach.limit}
                      {breach.note ? ` — ${breach.note}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ACT — the lesson, when the attempt produced one. */}
        {learningCase && (
          <section className="border-t border-border pt-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Lesson · saved for reuse
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
              {learningCase}
            </p>
            {verdict === 'LEARNING' && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {LEARNING_EXPLANATION}
              </p>
            )}
          </section>
        )}
        </div>
        )}

        {blocked && (
          <p className="flex items-start gap-1.5 rounded-xl border border-seal/40 bg-seal-soft p-3 text-sm leading-relaxed text-seal">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Held by an open governance gate. Nothing further happens to this task
            until you decide that gate.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {!blocked && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {task.status === 'dispatched' && (
              <ActionButton
                onClick={() => run(() => runTask({ taskId: task.id }))}
                busy={busy}
                icon={Play}
                label="Run task"
                tone="primary"
              />
            )}

            {task.status === 'reported' && (
              <ActionButton
                onClick={() => run(() => checkTask({ taskId: task.id }))}
                busy={busy}
                icon={Scale}
                label="Check result"
                tone="primary"
              />
            )}

            {verdict === 'FAIL' && !task.reabsorbedAt && (
              <ActionButton
                onClick={() => setEscalating((v) => !v)}
                busy={false}
                icon={GitBranch}
                label={escalating ? 'Close escalation' : 'Escalate failure'}
                tone="seal"
              />
            )}

            {(verdict === 'PASS' || verdict === 'LEARNING') && !task.reabsorbedAt && (
              <ActionButton
                onClick={() => run(() => reabsorbTask({ taskId: task.id }))}
                busy={busy}
                icon={GitBranch}
                label="Accept result"
                tone="primary"
              />
            )}

            {task.reabsorbedAt && (
              <p className="text-xs font-medium text-seal">
                Accepted — added under this sub-goal
              </p>
            )}
          </div>
        )}

        {escalating && !blocked && (
          <EscalationForm
            taskId={task.id}
            busy={busy}
            onSubmit={async (payload) => {
              await run(() => escalateTask({ taskId: task.id, ...payload }))
              setEscalating(false)
            }}
            onCancel={() => setEscalating(false)}
          />
        )}
      </div>
    </article>
  )
}
