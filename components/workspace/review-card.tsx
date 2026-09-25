'use client'

import type { BotRow } from '@/app/actions/projects'
import {
  getLatestReview,
  recordDecision,
  runProjectReview,
  type ReviewRow,
} from '@/app/actions/orchestrator'
import { useLocale } from '@/components/i18n/locale-provider'
import {
  Card,
  StatusPill,
  useRelativeTime,
  type PillTone,
} from '@/components/workspace/ui/primitives'
import { format } from '@/lib/i18n'
import { ChevronRight, Play, Plus } from 'lucide-react'
import { useState } from 'react'
import useSWR, { mutate } from 'swr'

type Finding = {
  department: string
  severity: 'info' | 'attention' | 'critical'
  summary: string
  detail: string
}

type ReviewAction = {
  label: string
  kind: 'ask_department' | 'create_decision' | 'open_objective'
  targetId: string | null
  departmentName: string | null
}

const SEVERITY_TONE: Record<Finding['severity'], PillTone> = {
  critical: 'review',
  attention: 'progress',
  info: 'approved',
}

interface ReviewCardProps {
  projectId: string
  bots: BotRow[]
  onAskDepartment: (botId: string) => void
  onOpenObjective: (objectiveId: string) => void
}

/**
 * The orchestrator's standing review of the project: what each department's
 * record shows, and the actions the review recommends — each one wired to the
 * view that carries it out.
 */
export function ReviewCard({
  projectId,
  bots,
  onAskDepartment,
  onOpenObjective,
}: ReviewCardProps) {
  const { t } = useLocale()
  const labels = t.tabs.orchestrator
  const relative = useRelativeTime()
  const [running, setRunning] = useState(false)
  const [drafting, setDrafting] = useState<ReviewAction | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const { data: review } = useSWR(['review', projectId], () =>
    getLatestReview(projectId),
  )

  async function run() {
    setRunning(true)
    try {
      await runProjectReview(projectId)
      await mutate(['review', projectId])
    } finally {
      setRunning(false)
    }
  }

  async function saveDecision() {
    if (!drafting || !draftTitle.trim()) return
    await recordDecision({ projectId, title: draftTitle.trim() })
    setDrafting(null)
    setDraftTitle('')
    await mutate(['decisions', projectId])
  }

  const findings = (review?.findings ?? []) as Finding[]
  const actions = (review?.actions ?? []) as ReviewAction[]
  const botName = (botId: string | null) =>
    bots.find((bot) => bot.id === botId)?.displayName ?? null

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            {labels.latestReview}
          </h2>
          {review && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {relative(review.createdAt)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Play className="size-3.5" aria-hidden="true" />
          {running ? labels.reviewing : labels.runReview}
        </button>
      </div>

      {!review ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm leading-relaxed text-muted-foreground">
          {labels.reviewEmpty}
        </p>
      ) : (
        <>
          <section aria-label={labels.findings} className="mt-4">
            <h3 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {labels.findings}
            </h3>
            <ul className="mt-2 space-y-2.5">
              {findings.map((finding, index) => (
                <li
                  key={`${finding.summary}-${index}`}
                  className="rounded-md border border-border bg-background px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <StatusPill tone={SEVERITY_TONE[finding.severity]}>
                      {finding.department}
                    </StatusPill>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {finding.summary}
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-pretty text-muted-foreground">
                    {finding.detail}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label={labels.recommended} className="mt-5">
            <h3 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {labels.recommended}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {actions.map((action, index) => (
                <li key={`${action.label}-${index}`}>
                  {action.kind === 'ask_department' && action.targetId && (
                    <button
                      type="button"
                      onClick={() => onAskDepartment(action.targetId!)}
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {format(labels.askDept, {
                          name: botName(action.targetId) ?? action.label,
                        })}
                      </span>
                      <ChevronRight
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                  {action.kind === 'open_objective' && action.targetId && (
                    <button
                      type="button"
                      onClick={() => onOpenObjective(action.targetId!)}
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {action.label}
                      </span>
                      <ChevronRight
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                  {action.kind === 'create_decision' && (
                    <button
                      type="button"
                      onClick={() => {
                        setDrafting(action)
                        setDraftTitle(action.label)
                      }}
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
                    >
                      <Plus
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {action.label}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {drafting && (
              <div className="mt-3 rounded-md border border-border bg-background p-3">
                <label
                  htmlFor="review-decision-title"
                  className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase"
                >
                  {labels.decisionTitle}
                </label>
                <input
                  id="review-decision-title"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-border bg-card px-2.5 text-sm text-foreground outline-none focus:border-seal/50"
                />
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={saveDecision}
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    {labels.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrafting(null)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {labels.cancel}
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </Card>
  )
}

export type { ReviewRow }
