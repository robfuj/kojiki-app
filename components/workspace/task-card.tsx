'use client'

import { getCatalogOptions } from '@/app/actions/providers'
import {
  approveTaskModel,
  checkTask,
  escalateTask,
  reabsorbTask,
  runTask,
  type TaskRow,
} from '@/app/actions/tasks'
import {
  ERROR_CLASS_HINTS,
  ERROR_CLASS_LABELS,
  LEARNING_EXPLANATION,
  TASK_STATUS_LABELS,
  VALIDATION_LABELS,
  type ErrorClass,
  type ValidationResult,
} from '@/lib/agent-labels'
import { formatUsd } from '@/lib/cost'
import type { Guardrail, GuardrailBreach, SuccessCriterion } from '@/lib/kaizen'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  GitBranch,
  Lightbulb,
  MessageSquare,
  Play,
  Scale,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

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
        <h4 className="text-base font-medium text-balance text-foreground">{task.title}</h4>

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
        {/* PLAN — criteria fixed before the work started. */}
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Plan · success criteria fixed before dispatch
          </p>

          {criteria.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No criteria were recorded, so there is nothing to check against.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {criteria.map((criterion) => {
                const actual = actuals[criterion.metric]
                const measured = actual !== undefined
                return (
                  <li
                    key={criterion.metric}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-xs"
                  >
                    <span className="text-foreground">{criterion.metric}</span>
                    <span className="text-muted-foreground/70">
                      {OPERATOR_LABEL[criterion.operator] ?? criterion.operator}{' '}
                      {criterion.target}
                      {criterion.unit ? ` ${criterion.unit}` : ''}
                    </span>
                    <span className="text-muted-foreground/50">w{criterion.weight}</span>
                    {measured && (
                      <span
                        className={cn(
                          'ml-auto tabular-nums',
                          verdict === 'FAIL' ? 'text-destructive' : 'text-foreground',
                        )}
                      >
                        actual {actual}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
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
              Do · reported by {task.subAgentTitle}
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
              Check · compared against the criteria above
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
              Act · lesson sealed for reuse
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
                label="Check against criteria"
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
                label="Reabsorb into OKR tree"
                tone="primary"
              />
            )}

            {task.reabsorbedAt && (
              <p className="text-xs font-medium text-seal">
                reabsorbed — proposed as a node under this sub-goal
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

interface ActionButtonProps {
  onClick: () => void
  busy: boolean
  icon: typeof Play
  label: string
  tone: 'primary' | 'seal'
}

function ActionButton({ onClick, busy, icon: Icon, label, tone }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50',
        tone === 'primary'
          ? 'bg-sumi text-primary-foreground hover:opacity-90'
          : 'border border-seal/50 bg-seal-soft text-seal hover:bg-seal hover:text-primary-foreground',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {busy ? 'Working…' : label}
    </button>
  )
}

interface EscalationFormProps {
  taskId: string
  busy: boolean
  onSubmit: (payload: {
    errorClass: ErrorClass
    redefinition?: string | null
    reason?: string | null
  }) => Promise<void>
  onCancel: () => void
}

/**
 * Neuraxis escalation.
 *
 * The user picks the layer by naming what actually went wrong. L0-L2 resolve
 * autonomously; L3 and L4 open a gate and block the task, and the form says which
 * before the choice is made rather than after.
 */
function EscalationForm({ busy, onSubmit, onCancel }: EscalationFormProps) {
  const [errorClass, setErrorClass] = useState<ErrorClass>('execution')
  const [redefinition, setRedefinition] = useState('')
  const [reason, setReason] = useState('')

  const needsRdefinition = errorClass === 'assumption' || errorClass === 'model'
  const isGovernance = errorClass === 'model' || errorClass === 'meta'

  return (
    <div className="rounded-xl border border-seal/40 bg-background p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
        Neuraxis · escalate to the layer that can fix this
      </p>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-muted-foreground">
          What actually went wrong
        </legend>
        <div className="mt-2 space-y-1.5">
          {(Object.keys(ERROR_CLASS_LABELS) as ErrorClass[]).map((key) => (
            <label
              key={key}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 transition-colors',
                errorClass === key
                  ? 'border-seal/50 bg-seal-soft'
                  : 'border-border bg-card hover:border-sumi/40',
              )}
            >
              <input
                type="radio"
                name="error-class"
                value={key}
                checked={errorClass === key}
                onChange={() => setErrorClass(key)}
                className="mt-0.5 size-3.5 accent-[var(--seal)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {ERROR_CLASS_LABELS[key]}
                </span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {ERROR_CLASS_HINTS[key]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {isGovernance && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-seal/40 bg-seal-soft p-2.5 text-sm leading-relaxed text-seal">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          This reaches L3 or L4. It will open a governance gate and block the task
          until you decide it — no agent can approve a change to its own authority.
        </p>
      )}

      {needsRdefinition && (
        <div className="mt-3">
          <label
            htmlFor="escalation-redefinition"
            className="text-xs font-medium text-muted-foreground"
          >
            Redefinition — the corrected problem statement
          </label>
          <textarea
            id="escalation-redefinition"
            rows={2}
            value={redefinition}
            onChange={(event) => setRedefinition(event.target.value)}
            placeholder="What the problem actually is, now that the old framing is known to be wrong"
            className="mt-1.5 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            The superseded statement is kept, not overwritten, so the reasoning
            stays auditable.
          </p>
        </div>
      )}

      <div className="mt-3">
        <label
          htmlFor="escalation-reason"
          className="text-xs font-medium text-muted-foreground"
        >
          Why (optional)
        </label>
        <input
          id="escalation-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What made you classify it this way"
          className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            onSubmit({
              errorClass,
              redefinition: redefinition.trim() || null,
              reason: reason.trim() || null,
            })
          }
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-seal px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <GitBranch className="size-3.5" aria-hidden="true" />
          {busy ? 'Escalating…' : 'Escalate'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

interface ModelApprovalProps {
  task: TaskRow
  busy: boolean
  onApprove: (modelId: string | null) => Promise<void>
}

/**
 * The head proposed a model; the user authorises it.
 *
 * This is the point where spending becomes consented to. The estimate is shown
 * above the button rather than revealed afterwards, and the user can substitute a
 * different model — an approval of a number only means something if the number is
 * visible and the choice is genuinely theirs.
 */
function ModelApproval({ task, busy, onApprove }: ModelApprovalProps) {
  const [choosing, setChoosing] = useState(false)
  const [modelId, setModelId] = useState('')

  // The catalog is fetched only once the user asks to substitute. It is the
  // largest payload this panel can pull, and most tasks are approved as proposed.
  const { data: options } = useSWR(
    choosing ? 'catalog-options' : null,
    getCatalogOptions,
    { revalidateOnFocus: false },
  )

  return (
    <section className="rounded-xl border border-seal/40 bg-seal-soft p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
        Model · proposed by {task.parentSpecialistKey}, awaiting your approval
      </p>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-foreground">
          {task.proposedModelLabel ?? task.proposedModelId}
        </span>
        {task.proposedModelLabel && task.proposedModelId && (
          <span className="font-mono text-xs text-muted-foreground">
            {task.proposedModelId}
          </span>
        )}
        {task.estimatedCostUsd !== null && (
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-foreground">
            <Coins className="size-3.5 text-seal" aria-hidden="true" />
            ~{formatUsd(task.estimatedCostUsd)}
          </span>
        )}
      </div>

      {task.modelRationale && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {task.modelRationale}
        </p>
      )}

      {task.estimatedInputTokens !== null && task.estimatedOutputTokens !== null && (
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
          estimated {task.estimatedInputTokens.toLocaleString()} tokens in /{' '}
          {task.estimatedOutputTokens.toLocaleString()} out
        </p>
      )}

      {choosing && (
        <div className="mt-3">
          <label
            htmlFor={`model-${task.id}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Run it on a different model
          </label>
          <select
            id={`model-${task.id}`}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
          >
            {options === undefined ? (
              <option value="">Loading catalog…</option>
            ) : (
              <option value="">Keep the proposed model</option>
            )}
            {(options ?? []).map((option) => (
              <option key={option.modelId} value={option.modelId}>
                {option.label} — ${option.inputPricePer1m.toFixed(2)}/1M in, $
                {option.outputPricePer1m.toFixed(2)}/1M out
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onApprove(modelId || null)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-seal px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {busy
            ? 'Working…'
            : modelId
              ? 'Approve this model'
              : 'Approve and allow spend'}
        </button>

        <button
          type="button"
          onClick={() => setChoosing((v) => !v)}
          className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
        >
          {choosing ? 'Keep the proposal' : 'Choose a different model'}
        </button>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        Nothing runs until you approve. A task cannot be dispatched on a model you
        did not authorise.
      </p>
    </section>
  )
}
