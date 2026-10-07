'use client'

import useSWR from 'swr'
import { listDepartmentWork } from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import { AgentFace } from './agent-face'
import { summariseAgent, type AgentStatus } from './agent-status'

interface SidebarAgentsProps {
  projectId: string
  collapsed: boolean
  onSelectAgent: (botId: string) => void
}

/** Compact roster for the rail: face, name and status written out, same data as the Overview orbit. */
export function SidebarAgents({ projectId, collapsed, onSelectAgent }: SidebarAgentsProps) {
  const { t } = useLocale()
  const labels = t.tabs.overview
  const { data: departments } = useSWR(['departments', projectId], () =>
    listDepartmentWork(projectId),
  )

  const agents = (departments ?? []).map(summariseAgent)
  if (agents.length === 0) return null

  const statusLabel: Record<AgentStatus, string> = {
    working: labels.agentWorking,
    waiting: labels.agentWaiting,
    idle: labels.agentIdle,
  }
  const working = agents.filter((agent) => agent.status === 'working').length

  return (
    <div>
      {!collapsed && (
        <p className="flex items-baseline justify-between gap-2 px-2.5 pb-1.5 text-[13px] font-semibold text-muted-foreground">
          <span>{labels.agentsTitle}</span>
          <span className="font-normal">
            {labels.agentsWorkingCount
              .replace('{working}', String(working))
              .replace('{total}', String(agents.length))}
          </span>
        </p>
      )}
      <ul className="space-y-0.5">
        {agents.map((agent) => (
          <li key={agent.botId}>
            <button
              type="button"
              onClick={() => onSelectAgent(agent.botId)}
              title={collapsed ? `${agent.name}: ${statusLabel[agent.status]}` : undefined}
              className={
                collapsed
                  ? 'mx-auto flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-muted'
                  : 'flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted'
              }
            >
              <AgentFace status={agent.status} tint={agent.tint} size="sm" />
              {collapsed ? (
                <span className="sr-only">{`${agent.name}: ${statusLabel[agent.status]}`}</span>
              ) : (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{agent.name}</span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {statusLabel[agent.status]}
                  </span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
