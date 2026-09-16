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
        'rounded-2xl border bg-card p-4 shadow-soft sm:p-5',
        decided ? 'border-border' : 'border-seal/50',
      )}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          className={cn('mt-0.5 size-4 shrink-0', decided ? 'text-muted-foreground' : 'text-seal')}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-medium text-balance text-foreground">{gate.title}</h4>

            <span className="rounded-full bg-seal-soft px-2.5 py-0.5 text-xs font-medium text-seal">
              {gate.layer} · {layerLabel(gate.layer)}
            </span>

            <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
              {gate.changeType.replace('_', ' ')}
            </span>

            {decided ? (
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  gate.decision === 'approved'
                    ? 'bg-seal-soft text-seal'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {gate.decision}
              </span>
            ) : (
              <span className="rounded-full bg-sumi px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                awaiting you
              </span>
            )}
          </div>

          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{gate.summary}</p>

          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                requested by
              </dt>
              <dd className="min-w-0 flex-1 text-sm text-foreground">{gate.requestedByTitle}</dd>
            </div>

            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                corroboration
              </dt>
              <dd className="min-w-0 flex-1 text-sm text-foreground">
                {gate.corroborationCount} sealed experience
                {gate.corroborationCount === 1 ? '' : 's'}
                <span className="text-muted-foreground">
                  {' '}
                  — the gate counts verified traces, not assertions
                </span>
              </dd>
            </div>

            {gate.recommendation && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  recommendation
                </dt>
                <dd className="min-w-0 flex-1 text-sm text-foreground">{gate.recommendation}</dd>
              </div>
            )}

            {gate.approveRole && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  approve role
                </dt>
                <dd className="min-w-0 flex-1 text-sm text-foreground">{gate.approveRole}</dd>
              </div>
            )}

            {consult.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  consult
                </dt>
                <dd className="min-w-0 flex-1 text-sm text-foreground">{consult.join(' · ')}</dd>
              </div>
            )}

            {proposedEntries.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  would change
                </dt>
                <dd className="min-w-0 flex-1 text-sm text-foreground">
                  {proposedEntries.map(([key, value]) => (
                    <span key={key} className="block">
                      <span className="text-muted-foreground">{key}:</span>{' '}
                      {typeof value === 'string' ? value : JSON.stringify(value)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {overdue && (
            <p className="mt-2.5 text-xs font-medium text-seal">
              SLA breached — surfaced, never auto-applied
            </p>
          )}

          {!decided && (
            <>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                This change alters what an agent is permitted to decide. It will not
                apply itself, and no agent can approve it on your behalf.
              </p>

              {showNote && (
                <div className="mt-3">
                  <label
                    htmlFor={`gate-note-${gate.id}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Decision note (optional)
                  </label>
                  <textarea
                    id={`gate-note-${gate.id}`}
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Why you approved or denied this"
                    className="mt-1.5 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
                  />
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => decide('approved')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-seal px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Recording…' : 'Approve change'}
                </button>

                <button
                  type="button"
                  onClick={() => decide('denied')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                >
                  Deny
                </button>

                <button
                  type="button"
                  onClick={() => setShowNote((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showNote ? 'Hide note' : 'Add note'}
                </button>
              </div>
            </>
          )}

          {decided && gate.decisionNote && (
            <p className="mt-4 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-xs font-medium text-muted-foreground">
                your note:{' '}
              </span>
              {gate.decisionNote}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-2.5 text-sm text-destructive">
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
