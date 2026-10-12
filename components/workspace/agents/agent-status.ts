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

/** Mascot-sheet colours, matched by department name; unknown names fall back to roster position. */
const DEPARTMENT_TINTS: [RegExp, string][] = [
  [/orchestr|head/i, 'bg-[#E0644E]'],
  [/engineer/i, 'bg-[#6F9A7E]'],
  [/strateg/i, 'bg-[#7467A8]'],
  [/financ/i, 'bg-[#E3BE6A]'],
  [/\bhr\b|people/i, 'bg-[#F09A9A]'],
  [/product/i, 'bg-[#7E9CC2]'],
  [/market/i, 'bg-[#B8A4D6]'],
]

export function departmentTint(name: string, index: number) {
  return (
    DEPARTMENT_TINTS.find(([pattern]) => pattern.test(name))?.[1] ??
    AGENT_TINTS[index % AGENT_TINTS.length]
  )
}

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
    tint: departmentTint(department.displayName, index),
  }
}

/** The orchestrator reflects its team: waiting beats working beats idle. */
export function orchestratorStatus(agents: AgentSummary[]): AgentStatus {
  if (agents.some((agent) => agent.status === 'waiting')) return 'waiting'
  if (agents.some((agent) => agent.status === 'working')) return 'working'
  return 'idle'
}
