'use client'

import { getCatalogOptions } from '@/app/actions/providers'
import type { TaskRow } from '@/app/actions/tasks'
import { ERROR_CLASS_HINTS, ERROR_CLASS_LABELS, type ErrorClass } from '@/lib/agent-labels'
import { formatUsd } from '@/lib/cost'
import { cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Coins, GitBranch, Play } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

export interface ActionButtonProps {
  onClick: () => void
  busy: boolean
  icon: typeof Play
  label: string
  tone: 'primary' | 'seal'
}

export function ActionButton({ onClick, busy, icon: Icon, label, tone }: ActionButtonProps) {
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

export interface EscalationFormProps {
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
export function EscalationForm({ busy, onSubmit, onCancel }: EscalationFormProps) {
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

export interface ModelApprovalProps {
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
export function ModelApproval({ task, busy, onApprove }: ModelApprovalProps) {
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
