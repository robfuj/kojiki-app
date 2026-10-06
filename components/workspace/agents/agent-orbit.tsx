'use client'

import type { DepartmentWork } from '@/app/actions/workspace'
import { useLocale } from '@/components/i18n/locale-provider'
import { Card } from '@/components/workspace/ui/primitives'
import { format } from '@/lib/i18n'
import { AgentFace } from './agent-face'
import { orchestratorStatus, summariseAgent, type AgentStatus } from './agent-status'

interface AgentOrbitProps {
  departments: DepartmentWork[]
  onSelectAgent: (botId: string) => void
}

/** Home view: the orchestrator in the centre, each department agent on a ring around it with its live status. */
export function AgentOrbit({ departments, onSelectAgent }: AgentOrbitProps) {
  const { t } = useLocale()
  const labels = t.tabs.overview
  const agents = departments.map(summariseAgent)
  if (agents.length === 0) return null

  const statusLabel: Record<AgentStatus, string> = {
    working: labels.agentWorking,
    waiting: labels.agentWaiting,
    idle: labels.agentIdle,
  }
  const centre = orchestratorStatus(agents)
  const workingCount = agents.filter((agent) => agent.status === 'working').length

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-sm font-medium text-foreground">{labels.agentsTitle}</p>
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {format(labels.agentsWorkingCount, {
            working: String(workingCount),
            total: String(agents.length),
          })}
        </span>
      </div>

      {/* Ring layout needs absolute positioning; below md the same agents render as a plain list. */}
      <div className="relative mx-auto hidden aspect-square w-full max-w-md md:block">
        <div className="absolute inset-[14%] rounded-full border border-dashed border-border" aria-hidden="true" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <AgentFace status={centre} tint="bg-primary/15 text-primary" size="lg" />
          <p className="text-base font-semibold text-foreground">{labels.orchestrator}</p>
          <p className="text-[13px] text-muted-foreground">{statusLabel[centre]}</p>
        </div>
        <ul>
          {agents.map((agent, index) => {
            const angle = (index / agents.length) * 2 * Math.PI - Math.PI / 2
            const left = 50 + 36 * Math.cos(angle)
            const top = 50 + 36 * Math.sin(angle)
            return (
              <li
                key={agent.botId}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <AgentButton agent={agent} statusText={statusLabel[agent.status]} onSelect={onSelectAgent} />
              </li>
            )
          })}
        </ul>
      </div>

      <ul className="flex flex-col divide-y divide-border border-t border-border md:hidden">
        {agents.map((agent) => (
          <li key={agent.botId}>
            <button
              type="button"
              onClick={() => onSelectAgent(agent.botId)}
              className="flex min-h-12 w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/60"
            >
              <AgentFace status={agent.status} tint={agent.tint} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{agent.name}</span>
              <span className="text-[13px] text-muted-foreground">{statusLabel[agent.status]}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="px-5 pt-2 pb-5 text-center text-[13px] text-muted-foreground text-pretty">
        {labels.agentsHint}
      </p>
    </Card>
  )
}

function AgentButton({
  agent,
  statusText,
  onSelect,
}: {
  agent: ReturnType<typeof summariseAgent>
  statusText: string
  onSelect: (botId: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.botId)}
      className="flex w-28 flex-col items-center gap-1.5 rounded-2xl p-2 text-center transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <AgentFace status={agent.status} tint={agent.tint} />
      <span className="w-full truncate text-sm font-medium text-foreground">{agent.name}</span>
      <span className="text-[13px] text-muted-foreground">{statusText}</span>
    </button>
  )
}
