'use client'

import {
  createObjective,
  deleteObjective,
  getOkrTree,
  populateSubGoals,
  setObjectiveProgress,
  type OkrNode,
} from '@/app/actions/okr'
import type { BotRow } from '@/app/actions/projects'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import useSWR from 'swr'

interface OkrTreeProps {
  projectId: string
  projectName: string
  bots: BotRow[]
  /** Opens the execution panel for a sub-goal: its tasks, gates and agent traffic. */
  onOpenSubGoal: (objectiveId: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  proposed: 'proposed',
  active: 'active',
  in_progress: 'in progress',
  complete: 'complete',
}

export function OkrTree({ projectId, projectName, bots, onOpenSubGoal }: OkrTreeProps) {
  const { data, isLoading, mutate } = useSWR(
    ['okr', projectId],
    () => getOkrTree(projectId),
    { revalidateOnFocus: false },
  )

  const botName = useCallback(
    (botId: string | null) => {
      if (!botId) return null
      return bots.find((bot) => bot.id === botId)?.displayName ?? 'unassigned'
    },
    [bots],
  )

  const refresh = useCallback(() => mutate(), [mutate])

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="space-y-3" aria-busy="true">
          <p className="sr-only">Loading OKR tree</p>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl bg-muted"
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    )
  }

  const roots = data ?? []

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-seal">
            OKR tree
          </p>
          <h2 className="mt-2 font-serif text-3xl leading-tight text-balance text-foreground">
            {projectName}
          </h2>
        </div>

        <p className="text-sm text-muted-foreground">
          overall goal → sub-goals → department completion
        </p>
      </header>

      {roots.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm leading-relaxed text-muted-foreground">
          No goals yet. Create the Overall Goal to root the tree.
        </p>
      ) : (
        <div className="mt-8">
          {roots.map((node) => (
            <ObjectiveNode
              key={node.id}
              node={node}
              botName={botName}
              onChanged={refresh}
              canAddChild={node.depth < 3}
              onOpenSubGoal={onOpenSubGoal}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ObjectiveNodeProps {
  node: OkrNode
  botName: (botId: string | null) => string | null
  onChanged: () => void
  canAddChild: boolean
  onOpenSubGoal: (objectiveId: string) => void
}

function ObjectiveNode({
  node,
  botName,
  onChanged,
  canAddChild,
  onOpenSubGoal,
}: ObjectiveNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const [draft, setDraft] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasChildren = node.children.length > 0
  const progress = draft ?? node.progress
  const owner = botName(node.ownerBotId)
  const isRoot = node.depth === 0

  async function commitProgress(value: number) {
    setBusy(true)
    try {
      await setObjectiveProgress({ id: node.id, progress: value })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update progress')
    } finally {
      setDraft(null)
      setBusy(false)
    }
  }

  async function decompose() {
    setBusy(true)
    setError(null)
    try {
      await populateSubGoals({
        projectId: node.projectId,
        parentObjectiveId: node.id,
      })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agents could not decompose this goal')
    } finally {
      setBusy(false)
    }
  }

  async function addChild() {
    if (!newTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createObjective({
        projectId: node.projectId,
        parentObjectiveId: node.id,
        title: newTitle,
      })
      setNewTitle('')
      setAdding(false)
      setExpanded(true)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add sub-goal')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deleteObjective(node.id)
      onChanged()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className={cn(node.depth > 0 && 'ml-4 border-l border-border pl-4 sm:ml-6 sm:pl-5')}>
      <article
        className={cn(
          'group rounded-2xl border bg-card transition-shadow',
          isRoot
            ? 'border-sumi/30 shadow-soft'
            : 'border-border shadow-soft hover:shadow-elevated',
        )}
      >
        <div className="flex items-start gap-3 p-4 sm:p-5">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse sub-goals' : 'Expand sub-goals'}
              className="mt-1 shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {expanded ? (
                <ChevronDown className="size-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span
              className="mt-2.5 size-1.5 shrink-0 rounded-full bg-border"
              aria-hidden="true"
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {isRoot ? (
                <h3 className="font-serif text-xl leading-snug text-balance text-foreground">
                  {node.title}
                </h3>
              ) : (
                // A sub-goal opens its execution panel: the tasks, the Kaizen
                // verdicts, any governance gate, and the agent traffic behind it.
                <button
                  type="button"
                  onClick={() => onOpenSubGoal(node.id)}
                  className="text-left text-base font-medium text-balance text-foreground underline-offset-4 transition-colors hover:text-seal hover:underline"
                >
                  {node.title}
                </button>
              )}

              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  node.status === 'complete'
                    ? 'bg-seal-soft text-seal'
                    : node.status === 'in_progress'
                      ? 'bg-sumi-soft text-sumi'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {STATUS_LABEL[node.status] ?? node.status}
              </span>

              {owner && (
                <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
                  {owner}
                </span>
              )}

              {/* Reabsorption names the sub-agent that did the work, so the tree
                  reads as "proposed · Marketing · SEO Specialist" rather than as
                  an anonymous departmental claim. */}
              {node.assigneeSubAgentTitle && (
                <span className="inline-flex items-center gap-1 rounded-full border border-seal/40 bg-seal-soft px-2.5 py-0.5 text-xs font-medium text-seal">
                  <span aria-hidden="true">↳</span>
                  {node.assigneeSubAgentTitle}
                </span>
              )}
            </div>

            {node.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {node.description}
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-300',
                    progress >= 100 ? 'bg-seal' : 'bg-sumi',
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <output
                className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-foreground"
                aria-live="polite"
              >
                {progress}%
              </output>

              <label className="sr-only" htmlFor={`progress-${node.id}`}>
                Completion percentage for {node.title}
              </label>
              <input
                id={`progress-${node.id}`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                disabled={busy}
                onChange={(event) => setDraft(Number(event.target.value))}
                onPointerUp={() => draft !== null && commitProgress(draft)}
                onKeyUp={() => draft !== null && commitProgress(draft)}
                onBlur={() => draft !== null && commitProgress(draft)}
                className="h-1 w-24 shrink-0 cursor-pointer appearance-none rounded-full bg-muted accent-[var(--seal)]"
              />
            </div>

            {hasChildren && (
              <p className="mt-2.5 text-xs text-muted-foreground">
                rolled up from {node.children.length} sub-goal
                {node.children.length === 1 ? '' : 's'}
              </p>
            )}

            {error && (
              <p role="alert" className="mt-2.5 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {canAddChild && (
                <>
                  <button
                    type="button"
                    onClick={decompose}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-seal hover:text-seal disabled:opacity-50"
                  >
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {busy ? 'Working…' : 'Agents decompose'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdding((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sumi hover:text-foreground"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Sub-goal
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={remove}
                disabled={busy}
                aria-label={`Delete ${node.title}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </button>
            </div>

            {adding && (
              <div className="mt-4 flex items-center gap-2">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault()
                      addChild()
                    }
                    if (event.key === 'Escape') setAdding(false)
                  }}
                  placeholder="Sub-goal title"
                  className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
                />
                <Button size="sm" onClick={addChild} disabled={busy}>
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>
      </article>

      {hasChildren && expanded && (
        <div className="mt-3 space-y-3">
          {node.children.map((child) => (
            <ObjectiveNode
              key={child.id}
              node={child}
              botName={botName}
              onChanged={onChanged}
              canAddChild={child.depth < 3}
              onOpenSubGoal={onOpenSubGoal}
            />
          ))}
        </div>
      )}
    </div>
  )
}
