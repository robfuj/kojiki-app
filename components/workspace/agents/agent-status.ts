import type { DepartmentWork } from '@/app/actions/workspace'

export type AgentStatus = 'working' | 'waiting' | 'idle'

const CLOSED_TASK_STATUSES = ['done', 'completed', 'cancelled', 'failed']
const WAITING_TASK_STATUSES = ['blocked', 'awaiting_gate', 'needs_review']

/** Each agent gets a fixed tint by roster position so it stays recognisable everywhere. */
export const AGENT_TINTS = [
  'bg-status-progress-soft text-status-progress',
  'bg-status-approved-soft text-status-approved',
  'bg-status-review-soft text-status-review',
  'bg-primary/15 text-primary',
  'bg-status-idle-soft text-status-idle',
] as const

export const STATUS_DOT: Record<AgentStatus, string> = {
  working: 'bg-status-progress',
  waiting: 'bg-status-review',
  idle: 'bg-status-idle',
}

export interface AgentSummary {
  botId: string
  name: string
  status: AgentStatus
  openTasks: number
  tint: string
}

export function summariseAgent(department: DepartmentWork, index: number): AgentSummary {
  const open = department.tasks.filter((task) => !CLOSED_TASK_STATUSES.includes(task.status))
  const waiting =
    department.pendingGates > 0 ||
    open.some((task) => WAITING_TASK_STATUSES.includes(task.status))
  const working = open.some((task) => !WAITING_TASK_STATUSES.includes(task.status))

  return {
    botId: department.botId,
    name: department.displayName,
    status: waiting ? 'waiting' : working ? 'working' : 'idle',
    openTasks: open.length,
    tint: AGENT_TINTS[index % AGENT_TINTS.length],
  }
}

/** The orchestrator reflects its team: waiting beats working beats idle. */
export function orchestratorStatus(agents: AgentSummary[]): AgentStatus {
  if (agents.some((agent) => agent.status === 'waiting')) return 'waiting'
  if (agents.some((agent) => agent.status === 'working')) return 'working'
  return 'idle'
}
