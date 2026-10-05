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

type NextAction = 'run' | 'check' | 'accept'

const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  run: 'Run task',
  check: 'Check result',
  accept: 'Accept result',
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
  const [open, setOpen] = useState(task.status === 'blocked')
  const [confirming, setConfirming] = useState<Exclude<NextAction, 'check'> | null>(null)
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
  const accepted = Boolean(task.reabsorbedAt)

  // Exactly one next step is offered on the row; everything else lives in the details.
  const nextAction: NextAction | null = blocked
    ? null
    : task.status === 'dispatched'
      ? 'run'
      : task.status === 'reported'
        ? 'check'
        : (verdict === 'PASS' || verdict === 'LEARNING') && !accepted
          ? 'accept'
          : null

  function startNextAction() {
    if (nextAction === 'check') {
      run(() => checkTask({ taskId: task.id }))
    } else if (nextAction) {
      setConfirming(nextAction)
    }
  }

  function confirmNextAction() {
    const action = confirming
    setConfirming(null)
    if (action === 'run') run(() => runTask({ taskId: task.id }))
    if (action === 'accept') run(() => reabsorbTask({ taskId: task.id }))
  }

  return (
    <article className={cn('transition-colors', open && 'bg-muted/30')}>
      <div className="flex min-h-16 items-center gap-4 px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
        >
          <ChevronDown
            className={cn(
              'size-5 shrink-0 text-muted-foreground transition-transform',
              !open && '-rotate-90',
            )}
            aria-hidden="true"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-pretty text-[17px] font-medium leading-snug text-foreground">
              {task.title}
            </span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  blocked
                    ? 'bg-status-review'
                    : accepted || task.status === 'reabsorbed'
                      ? 'bg-status-approved'
                      : task.status === 'proposed'
                        ? 'bg-status-idle'
                        : 'bg-status-progress',
                )}
                aria-hidden="true"
              />
              <span className="truncate">
                {task.subAgentTitle} · {TASK_STATUS_LABELS[task.status] ?? task.status}
              </span>
            </span>
          </span>
        </button>

        {nextAction && (
          <button
            type="button"
            onClick={startNextAction}
            disabled={busy || confirming !== null}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-sumi px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Working…' : NEXT_ACTION_LABEL[nextAction]}
          </button>
        )}
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby={`${detailsId}-confirm`}
          className="mx-5 mb-4 flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p id={`${detailsId}-confirm`} className="text-[17px] leading-relaxed text-foreground">
            {confirming === 'run'
              ? task.estimatedCostUsd !== null
                ? `This will cost about ${formatUsd(task.estimatedCostUsd)}. Continue?`
                : 'This runs the sub-agent and may cost money. Continue?'
              : 'This adds the result under this sub-goal. Continue?'}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="min-h-11 rounded-full border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmNextAction}
              autoFocus
              className="min-h-11 rounded-full bg-sumi px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 px-5 pb-5 empty:hidden">
        {open && (
        <div id={detailsId} className="flex flex-col gap-6 pl-8">
        {verdict && VerdictIcon && (
          <p
            className={cn(
              'inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium',
              VERDICT_TONE[verdict],
            )}
          >
            <VerdictIcon className="size-4" aria-hidden="true" />
            {VALIDATION_LABELS[verdict]} · {task.outcomeScore ?? 0}/100
          </p>
        )}
        {/* PLAN — criteria fixed before the work started. */}
        <section>
          <p className="text-sm font-medium text-muted-foreground">
            Targets · set before the work started
          </p>

          {criteria.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No criteria were recorded, so there is nothing to check against.
            </p>
          ) : (
            <table className="mt-2 w-full font-mono text-sm">
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
                  className="flex items-baseline gap-2 font-mono text-sm text-muted-foreground"
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
            <p className="mt-2.5 font-mono text-[13px] text-muted-foreground">
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
            <p className="text-sm font-medium text-muted-foreground">
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
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-muted-foreground">
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
            <p className="text-sm font-medium text-muted-foreground">
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
            <p className="text-sm font-medium text-muted-foreground">
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

        {open && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 pl-8">
            <button
              type="button"
              onClick={() => onTalkToSubAgent(task)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <MessageSquare className="size-4" aria-hidden="true" />
              Talk to {task.subAgentTitle}
            </button>

            {!blocked && verdict === 'FAIL' && !accepted && (
              <ActionButton
                onClick={() => setEscalating((v) => !v)}
                busy={false}
                icon={GitBranch}
                label={escalating ? 'Close escalation' : 'Escalate failure'}
                tone="seal"
              />
            )}

            {accepted && (
              <p className="text-sm font-medium text-seal">
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
