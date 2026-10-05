'use client'

import { getOkrTree, type OkrNode } from '@/app/actions/okr'
import { getProjectWorkspace } from '@/app/actions/projects'
import { getObjectiveKeyResults } from '@/app/actions/workspace'
import type { ChatFocus } from '@/components/workspace/chat-module'
import { useLocale } from '@/components/i18n/locale-provider'
import { KeyResultsTable } from '@/components/workspace/key-results-table'
import { OkrOutline } from '@/components/workspace/okr-outline'
import { SubGoalPanel } from '@/components/workspace/sub-goal-panel'
import {
  Card,
  Eyebrow,
  ProgressBar,
  StatusPill,
  toneForStatus,
} from '@/components/workspace/ui/primitives'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'
import useSWR from 'swr'

interface WorkTabProps {
  projectId: string
  selectedId: string | null
  onSelect: (objectiveId: string | null) => void
  onTalkToSubAgent: (focus: ChatFocus) => void
}

/**
 * The operating view: the whole objective tree as an outline on the left, and
 * the selected node's measured key results plus its execution panel on the
 * right.
 */
export function WorkTab({
  projectId,
  selectedId,
  onSelect,
  onTalkToSubAgent,
}: WorkTabProps) {
  const { t } = useLocale()
  const labels = t.tabs.work

  const { data: tree } = useSWR(['okr-tree', projectId], () =>
    getOkrTree(projectId),
  )
  const { data: workspace } = useSWR(['workspace', projectId], () =>
    getProjectWorkspace(projectId),
  )

  const flat = tree ? flatten(tree) : []
  const root = flat.find((node) => node.depth === 0) ?? null
  const selected =
    flat.find((node) => node.id === selectedId) ?? root ?? flat[0] ?? null

  // Arriving from an orchestrator action selects a node that may not be the
  // root; keep the outline and the panel on the same source of truth.
  useEffect(() => {
    if (!selectedId && root) onSelect(root.id)
  }, [selectedId, root, onSelect])

  const { data: keyResults } = useSWR(
    selected ? ['kr', selected.id] : null,
    () => getObjectiveKeyResults(selected!.id),
  )

  if (flat.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <TabHeader title={t.nav.work} subtitle={labels.subtitle} />
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          {labels.empty}
        </p>
      </div>
    )
  }

  const ownerName = selected?.ownerBotId
    ? (workspace?.bots.find((bot) => bot.id === selected.ownerBotId)
        ?.displayName ?? labels.unassigned)
    : labels.unassigned

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
      <TabHeader title={t.nav.work} subtitle={labels.subtitle} />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card className="self-start p-2 lg:sticky lg:top-4">
          <OkrOutline
            nodes={tree ?? []}
            selectedId={selected?.id ?? null}
            onSelect={onSelect}
            label={t.nav.work}
          />
        </Card>

        {selected && (
          <div className="min-w-0 space-y-4">
            <Card className="p-5">
              <Eyebrow>{selected.depth === 0 ? labels.owner : labels.timeframe}</Eyebrow>
              <h2 className="mt-1.5 text-lg font-semibold text-balance text-foreground">
                {selected.title}
              </h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <StatusPill tone={toneForStatus(selected.status)}>
                  {selected.status.replace(/_/g, ' ')}
                </StatusPill>
                {selected.timeframe && (
                  <span className="text-sm text-muted-foreground">
                    {selected.timeframe}
                  </span>
                )}
                <span className="text-sm text-muted-foreground">
                  {labels.owner}: {ownerName}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <ProgressBar value={selected.progress} className="max-w-sm" />
                <span className="text-sm tabular-nums text-muted-foreground">
                  {selected.progress}%
                </span>
              </div>
            </Card>

            <section aria-label={labels.keyResults}>
              <h3 className="text-sm font-medium text-foreground">
                {labels.keyResults}
              </h3>
              <div className="mt-2">
                <KeyResultsTable rows={keyResults ?? []} />
              </div>
            </section>

            <SubGoalPanel
              key={selected.id}
              objectiveId={selected.id}
              bots={workspace?.bots ?? []}
              onBack={() => onSelect(root?.id ?? null)}
              onTalkToSubAgent={(input) =>
                onTalkToSubAgent({ kind: 'sub_agent', ...input })
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

function TabHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function flatten(nodes: OkrNode[], depth = 0): (OkrNode & { depth: number })[] {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flatten(node.children, depth + 1),
  ])
}
