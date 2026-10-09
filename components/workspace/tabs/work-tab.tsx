'use client'

import { getOkrTree, type OkrNode } from '@/app/actions/okr'
import { getProjectWorkspace } from '@/app/actions/projects'
import { getObjectiveKeyResults } from '@/app/actions/workspace'
import type { ChatFocus } from '@/components/workspace/chat-module'
import { useLocale } from '@/components/i18n/locale-provider'
import { KeyResultsTable } from '@/components/workspace/key-results-table'
import { SubGoalPanel } from '@/components/workspace/sub-goal-panel'
import { ProgressBar } from '@/components/workspace/ui/primitives'
import { OkrCascade, pathTo } from '@/components/workspace/work/okr-cascade'
import { AGENT_TINTS } from '@/components/workspace/agents/agent-status'
import { ChevronRight, X } from 'lucide-react'
import { useEffect } from 'react'
import useSWR from 'swr'

interface WorkTabProps {
  projectId: string
  selectedId: string | null
  onSelect: (objectiveId: string | null) => void
  onTalkToSubAgent: (focus: ChatFocus) => void
}

/**
 * The operating view: the whole objective tree as one table, with the selected
 * goal opening in a side panel so the tree stays in view.
 */
export function WorkTab({ projectId, selectedId, onSelect, onTalkToSubAgent }: WorkTabProps) {
  const { t } = useLocale()
  const labels = t.tabs.work

  const { data: tree } = useSWR(['okr-tree', projectId], () => getOkrTree(projectId))
  const { data: workspace } = useSWR(['workspace', projectId], () => getProjectWorkspace(projectId))

  const nodes = tree ?? []
  const root = nodes[0] ?? null
  const trail = pathTo(nodes, selectedId) ?? []
  const selected = trail.at(-1) ?? null

  const ownerName = (botId: string | null) =>
    botId
      ? (workspace?.bots.find((bot) => bot.id === botId)?.displayName ?? labels.unassigned)
      : labels.unassigned

  const ownerTint = (botId: string | null) => {
    const index = botId ? (workspace?.bots.findIndex((bot) => bot.id === botId) ?? -1) : -1
    return index >= 0 ? AGENT_TINTS[index % AGENT_TINTS.length] : null
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t.nav.work}</h1>
        <p className="text-base text-muted-foreground">{labels.subtitle}</p>
      </header>

      {nodes.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border px-5 py-8 text-base text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {root && <GoalSummary node={root} />}
          <OkrCascade
            nodes={nodes}
            selectedId={selected?.id ?? null}
            onSelect={onSelect}
            ownerName={ownerName}
            ownerTint={ownerTint}
            label={t.nav.work}
            labels={{ objective: 'Objective', owner: labels.owner, progress: 'Progress', timeframe: labels.timeframe }}
          />
        </div>
      )}

      {selected && (
        <GoalPanel
          trail={trail}
          ownerName={ownerName(selected.ownerBotId)}
          ownerLabel={labels.owner}
          keyResultsLabel={labels.keyResults}
          onClose={() => onSelect(null)}
          onSelect={onSelect}
        >
          <SubGoalPanel
            key={selected.id}
            objectiveId={selected.id}
            bots={workspace?.bots ?? []}
            onBack={() => onSelect(null)}
            onTalkToSubAgent={(input) => onTalkToSubAgent({ kind: 'sub_agent', ...input })}
          />
        </GoalPanel>
      )}
    </div>
  )
}

function GoalSummary({ node }: { node: OkrNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">Company objective</span>
        <h2 className="text-xl font-semibold text-balance text-foreground">{node.title}</h2>
        {node.timeframe && <span className="text-base text-muted-foreground">{node.timeframe}</span>}
      </div>
      <div className="flex w-full items-center gap-3 md:w-72">
        <ProgressBar value={node.progress} />
        <span className="text-lg font-semibold tabular-nums text-foreground">{node.progress}%</span>
      </div>
    </section>
  )
}

interface GoalPanelProps {
  trail: OkrNode[]
  ownerName: string
  ownerLabel: string
  keyResultsLabel: string
  onClose: () => void
  onSelect: (id: string) => void
  children: React.ReactNode
}

function GoalPanel({ trail, ownerName, ownerLabel, keyResultsLabel, onClose, onSelect, children }: GoalPanelProps) {
  const goal = trail[trail.length - 1]
  const { data: keyResults } = useSWR(['kr', goal.id], () => getObjectiveKeyResults(goal.id))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <button
        type="button"
        aria-label="Close goal"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-foreground/10"
      />
      <aside
        role="dialog"
        aria-label={goal.title}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              {trail.slice(0, -1).map((node) => (
                <li key={node.id} className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(node.id)}
                    className="max-w-48 truncate rounded hover:text-foreground hover:underline"
                  >
                    {node.title}
                  </button>
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </li>
              ))}
              <li aria-current="page" className="max-w-64 truncate font-medium text-foreground">
                {goal.title}
              </li>
            </ol>
            <p className="mt-1 text-sm text-muted-foreground">
              {ownerLabel}: {ownerName}
              {goal.timeframe ? ` · ${goal.timeframe}` : ''}
            </p>
          </nav>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close goal"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-10">
          {children}
          <section aria-label={keyResultsLabel} className="flex flex-col gap-3">
            <h3 className="text-base font-semibold text-foreground">{keyResultsLabel}</h3>
            <KeyResultsTable rows={keyResults ?? []} />
          </section>
        </div>
      </aside>
    </>
  )
}
