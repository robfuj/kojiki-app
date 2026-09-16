'use client'

import type { SignalRow } from '@/app/actions/tasks'
import { SIGNAL_KIND_LABELS } from '@/lib/agent-labels'
import { cn } from '@/lib/utils'

/**
 * The Mycelium substrate, rendered.
 *
 * Agents never address each other directly — every dispatch, report and
 * reabsorption is a signal emitted through this layer and sealed into SENTINEL as
 * it goes. Showing the raw traffic is the point: the user watches agents
 * coordinate rather than being asked to trust a summary of it.
 */
interface MyceliumFeedProps {
  signals: SignalRow[]
}

const KIND_TONE: Record<string, string> = {
  dispatch: 'border-sumi/40 bg-sumi-soft text-sumi',
  report: 'border-border bg-background text-foreground',
  reabsorb: 'border-seal/40 bg-seal-soft text-seal',
  query: 'border-border bg-background text-muted-foreground',
  answer: 'border-border bg-background text-muted-foreground',
}

export function MyceliumFeed({ signals }: MyceliumFeedProps) {
  if (signals.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
        No agent traffic yet. Dispatching a sub-agent emits the first signal, and
        every report and reabsorption after it lands here.
      </p>
    )
  }

  return (
    <ol className="space-y-2.5" aria-label="Agent to agent traffic">
      {signals.map((signal) => (
        <li key={signal.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
                KIND_TONE[signal.signalKind] ?? KIND_TONE.answer,
              )}
            >
              {SIGNAL_KIND_LABELS[signal.signalKind] ?? signal.signalKind}
            </span>

            <p className="font-mono text-[10px] text-muted-foreground">
              <span className="text-foreground">{signal.fromTitle}</span>
              <span aria-hidden="true"> → </span>
              <span className="text-foreground">{signal.toTitle}</span>
            </p>

            <time
              dateTime={signal.firedAt.toISOString()}
              className="ml-auto font-mono text-[10px] text-muted-foreground/60"
            >
              {formatTimestamp(signal.firedAt)}
            </time>
          </div>

          <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
            {signal.body}
          </p>

          <p className="mt-2 font-mono text-[10px] text-muted-foreground/60">
            status {signal.status}
            {signal.sentinelEntryId ? ' · sealed in SENTINEL' : ''}
          </p>
        </li>
      ))}
    </ol>
  )
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
