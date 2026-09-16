'use client'

import { decideGateRequest, type GateRow } from '@/app/actions/tasks'
import {
  ERROR_CLASS_LABELS,
  layerLabel,
  type ErrorClass,
} from '@/lib/agent-labels'
import { cn } from '@/lib/utils'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'

/**
 * A governance gate: an L3 (ontology) or L4 (meta-strategy) change an agent asked
 * for.
 *
 * This card is the only path into `decideGateRequest`. That is the containment
 * property made visible — an agent may redefine its own problem autonomously, but
 * a change to its own authority stops here and waits for a human. The card says so
 * plainly rather than presenting approval as a routine confirmation.
 */
interface GateCardProps {
  gate: GateRow
  onDecided: () => void
}

export function GateCard({ gate, onDecided }: GateCardProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)

  const decided = gate.status !== 'pending'
  const overdue =
    !decided && gate.slaDueAt !== null && gate.slaDueAt.getTime() < Date.now()

  async function decide(decision: 'approved' | 'denied') {
    setBusy(true)
    setError(null)
    try {
      await decideGateRequest({
        gateRequestId: gate.id,
        decision,
        note: note.trim() || null,
      })
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your decision')
    } finally {
      setBusy(false)
    }
  }

  const proposed = gate.proposedChange as Record<string, unknown>
  const proposedEntries = Object.entries(proposed)
  const consult = gate.consult as string[]

  return (
    <article
      className={cn(
        'rounded-md border bg-card p-4',
        decided ? 'border-border' : 'border-seal/50 shadow-[inset_3px_0_0_0_var(--seal)]',
      )}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          className={cn('mt-0.5 size-4 shrink-0', decided ? 'text-muted-foreground' : 'text-seal')}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-balance text-foreground">{gate.title}</h4>

            <span className="rounded-sm bg-seal-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-seal">
              {gate.layer} · {layerLabel(gate.layer)}
            </span>

            <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {gate.changeType.replace('_', ' ')}
            </span>

            {decided ? (
              <span
                className={cn(
                  'rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
                  gate.decision === 'approved'
                    ? 'bg-seal-soft text-seal'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {gate.decision}
              </span>
            ) : (
              <span className="rounded-sm bg-sumi px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary-foreground">
                awaiting you
              </span>
            )}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{gate.summary}</p>

          <dl className="mt-3 space-y-1.5 font-mono text-[10px]">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 uppercase tracking-wide text-muted-foreground/70">
                requested by
              </dt>
              <dd className="min-w-0 flex-1 text-foreground">{gate.requestedByTitle}</dd>
            </div>

            <div className="flex gap-2">
              <dt className="w-28 shrink-0 uppercase tracking-wide text-muted-foreground/70">
                corroboration
              </dt>
              <dd className="min-w-0 flex-1 text-foreground">
                {gate.corroborationCount} sealed experience
                {gate.corroborationCount === 1 ? '' : 's'}
                <span className="text-muted-foreground/60">
                  {' '}
                  — the gate counts verified traces, not assertions
                </span>
              </dd>
            </div>

            {gate.recommendation && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 uppercase tracking-wide text-muted-foreground/70">
                  recommendation
                </dt>
                <dd className="min-w-0 flex-1 text-foreground">{gate.recommendation}</dd>
              </div>
            )}

            {gate.approveRole && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 uppercase tracking-wide text-muted-foreground/70">
                  approve role
                </dt>
                <dd className="min-w-0 flex-1 text-foreground">{gate.approveRole}</dd>
              </div>
            )}

            {consult.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 uppercase tracking-wide text-muted-foreground/70">
                  consult
                </dt>
                <dd className="min-w-0 flex-1 text-foreground">{consult.join(' · ')}</dd>
              </div>
            )}

            {proposedEntries.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 uppercase tracking-wide text-muted-foreground/70">
                  would change
                </dt>
                <dd className="min-w-0 flex-1 text-foreground">
                  {proposedEntries.map(([key, value]) => (
                    <span key={key} className="block">
                      <span className="text-muted-foreground/70">{key}:</span>{' '}
                      {typeof value === 'string' ? value : JSON.stringify(value)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {overdue && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-seal">
              SLA breached — surfaced, never auto-applied
            </p>
          )}

          {!decided && (
            <>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                This change alters what an agent is permitted to decide. It will not
                apply itself, and no agent can approve it on your behalf.
              </p>

              {showNote && (
                <div className="mt-3">
                  <label
                    htmlFor={`gate-note-${gate.id}`}
                    className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70"
                  >
                    Decision note (optional)
                  </label>
                  <textarea
                    id={`gate-note-${gate.id}`}
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Why you approved or denied this"
                    className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
                  />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => decide('approved')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-seal px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Recording…' : 'Approve change'}
                </button>

                <button
                  type="button"
                  onClick={() => decide('denied')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                >
                  Deny
                </button>

                <button
                  type="button"
                  onClick={() => setShowNote((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showNote ? 'Hide note' : 'Add note'}
                </button>
              </div>
            </>
          )}

          {decided && gate.decisionNote && (
            <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                your note:{' '}
              </span>
              {gate.decisionNote}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

/** Error-class picker labels, re-exported for the escalation form. */
export { ERROR_CLASS_LABELS, type ErrorClass }
