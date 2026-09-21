'use client'

import { listProjectDecisions } from '@/app/actions/workspace'
import { listDepartmentWork } from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import {
  AvatarCircle,
  Card,
  ProgressBar,
  StatusPill,
  departmentIcon,
  toneForStatus,
  useRelativeTime,
} from '@/components/workspace/ui/primitives'
import { format } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'

type DetailTab = 'goals' | 'decisions' | 'members' | 'info'

interface DepartmentsTabProps {
  projectId: string
  query: string
  selectedBotId: string | null
  onSelectBot: (botId: string | null) => void
  onChatWithBot: (botId: string) => void
}

/**
 * The organisation view: every department agent on the project, and for the
 * selected one its goals, its decisions, its team of sub-agents, and what it has
 * been signalling.
 */
export function DepartmentsTab({
  projectId,
  query,
  selectedBotId,
  onSelectBot,
  onChatWithBot,
}: DepartmentsTabProps) {
  const { t } = useLocale()
  const labels = t.tabs.departments
  const relative = useRelativeTime()
  const [detailTab, setDetailTab] = useState<DetailTab>('goals')

  const { data: departments } = useSWR(['departments', projectId], () =>
    listDepartmentWork(projectId),
  )
  const { data: decisions } = useSWR(['decisions', projectId], () =>
    listProjectDecisions(projectId),
  )

  const needle = query.trim().toLowerCase()
  const rows = (departments ?? []).filter(
    (dept) =>
      !needle ||
      `${dept.displayName} ${dept.functionLine}`.toLowerCase().includes(needle),
  )

  const selected =
    rows.find((dept) => dept.botId === selectedBotId) ?? rows[0] ?? null

  if (rows.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <TabHeader subtitle={labels.subtitle} />
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          {labels.empty}
        </p>
      </div>
    )
  }

  const deptDecisions = (decisions ?? []).filter(
    (decision) => decision.botId === selected?.botId,
  )
  const members = selected
    ? Array.from(new Set(selected.tasks.map((task) => task.subAgentTitle)))
    : []

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'goals', label: labels.goals },
    { key: 'decisions', label: labels.decisions },
    { key: 'members', label: labels.members },
    { key: 'info', label: labels.info },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
      <TabHeader subtitle={labels.subtitle} />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="self-start p-2">
          <ul className="space-y-0.5">
            {rows.map((dept) => {
              const Icon = departmentIcon(dept.specialistKey)
              const active = selected?.botId === dept.botId
              const progress =
                dept.objectives.length === 0
                  ? 0
                  : Math.round(
                      dept.objectives.reduce(
                        (sum, objective) => sum + objective.progress,
                        0,
                      ) / dept.objectives.length,
                    )
              return (
                <li key={dept.botId}>
                  <button
                    type="button"
                    onClick={() => onSelectBot(dept.botId)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                      active
                        ? 'bg-muted'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sumi-soft">
                      <Icon className="size-3.5 text-sumi" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {dept.displayName}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {dept.functionLine}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {progress}%
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {selected && (
          <Card className="self-start">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <AvatarCircle name={selected.displayName} className="size-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selected.displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selected.functionLine}
                </p>
              </div>
              {selected.pendingGates > 0 && (
                <StatusPill tone="review">
                  {format(labels.pendingGates, { count: selected.pendingGates })}
                </StatusPill>
              )}
              <button
                type="button"
                onClick={() => onChatWithBot(selected.botId)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <MessageSquare className="size-3.5" aria-hidden="true" />
                {format(labels.chatWith, { name: selected.displayName })}
              </button>
            </div>

            <div className="flex gap-1 border-b border-border px-3 py-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setDetailTab(tab.key)}
                  aria-pressed={detailTab === tab.key}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    detailTab === tab.key
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {detailTab === 'goals' && (
                <ul className="space-y-3">
                  {selected.objectives.length === 0 ? (
                    <li className="text-sm text-muted-foreground">
                      {t.tabs.work.empty}
                    </li>
                  ) : (
                    selected.objectives.map((objective) => (
                      <li key={objective.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {objective.title}
                          </p>
                          <StatusPill tone={toneForStatus(objective.status)}>
                            {objective.status.replace(/_/g, ' ')}
                          </StatusPill>
                          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                            {objective.progress}%
                          </span>
                        </div>
                        <ProgressBar value={objective.progress} className="mt-1.5" />
                      </li>
                    ))
                  )}
                </ul>
              )}

              {detailTab === 'decisions' && (
                <ul className="divide-y divide-border">
                  {deptDecisions.length === 0 ? (
                    <li className="py-2 text-sm text-muted-foreground">
                      {t.tabs.decisions.none}
                    </li>
                  ) : (
                    deptDecisions.map((decision) => (
                      <li
                        key={decision.id}
                        className="flex items-center gap-3 py-2.5"
                      >
                        <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {decision.title}
                        </p>
                        <StatusPill tone={toneForStatus(decision.status)}>
                          {t.tabs.decisions.statuses[
                            decision.status as 'proposed' | 'accepted' | 'rejected'
                          ] ?? t.tabs.decisions.statuses.other}
                        </StatusPill>
                        <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                          {relative(decision.createdAt)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}

              {detailTab === 'members' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {labels.head}
                    </p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <AvatarCircle name={selected.displayName} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {selected.displayName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {selected.functionLine}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {labels.team}
                    </p>
                    {members.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {labels.noSubAgents}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {members.map((member) => (
                          <li key={member} className="flex items-center gap-2.5">
                            <AvatarCircle name={member} />
                            <div className="min-w-0">
                              <p className="truncate text-sm text-foreground">
                                {member}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {selected.displayName}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {detailTab === 'info' && (
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {labels.mandate}
                    </p>
                    <p className="mt-1.5 leading-relaxed text-pretty text-foreground">
                      {selected.mandate ?? selected.functionLine}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {labels.functionLine}
                    </p>
                    <p className="mt-1.5 text-foreground">{selected.functionLine}</p>
                  </div>
                  {selected.signals.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                        {t.tabs.overview.signals}
                      </p>
                      <ul className="mt-2 space-y-2">
                        {selected.signals.slice(0, 5).map((signal) => (
                          <li
                            key={signal.id}
                            className="rounded-md border border-border bg-background px-3 py-2"
                          >
                            <p className="text-xs font-medium text-foreground">
                              {signal.fromTitle} → {signal.toTitle}
                              <span className="ml-1.5 text-muted-foreground">
                                ({signal.signalKind})
                              </span>
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {signal.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function TabHeader({ subtitle }: { subtitle: string }) {
  const { t } = useLocale()
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {t.nav.departments}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}
