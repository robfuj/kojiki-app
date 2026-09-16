import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  gateRequests,
  myceliumSignals,
  objectives,
  projectBots,
  subAgentTasks,
} from '@/lib/db/schema'
import { LAYER_LABELS, type EscalationLayer } from '@/lib/neuraxis'

/**
 * Renders live project state as prose for the orchestrator's system prompt.
 *
 * The orchestrator has no tools of its own; it answers from what is assembled
 * here. That is deliberate — it reports the ledger and the OKR tree as they
 * actually stand rather than being asked to go and look, which keeps its answers
 * anchored to recorded state instead of plausible reconstruction.
 */

interface ObjectiveRow {
  id: string
  parentObjectiveId: string | null
  ownerBotId: string | null
  assigneeSubAgentKey: string | null
  assigneeSubAgentTitle: string | null
  title: string
  kind: string
  status: string
  progress: number
  depth: number
  position: number
}

/**
 * The OKR tree as an indented outline. Each node names its status, the department
 * that owns it, and the sub-agent that did the work — so the orchestrator can
 * answer "who is doing what" without guessing.
 */
export async function summarizeOkrTree(
  projectId: string,
  userId: string,
): Promise<string | null> {
  const [rows, bots] = await Promise.all([
    db
      .select({
        id: objectives.id,
        parentObjectiveId: objectives.parentObjectiveId,
        ownerBotId: objectives.ownerBotId,
        assigneeSubAgentKey: objectives.assigneeSubAgentKey,
        assigneeSubAgentTitle: objectives.assigneeSubAgentTitle,
        title: objectives.title,
        kind: objectives.kind,
        status: objectives.status,
        progress: objectives.progress,
        depth: objectives.depth,
        position: objectives.position,
      })
      .from(objectives)
      .where(and(eq(objectives.projectId, projectId), eq(objectives.userId, userId)))
      .orderBy(objectives.depth, objectives.position),
    db
      .select({ id: projectBots.id, displayName: projectBots.displayName })
      .from(projectBots)
      .where(and(eq(projectBots.projectId, projectId), eq(projectBots.userId, userId))),
  ])

  if (rows.length === 0) return null

  const botName = new Map(bots.map((bot) => [bot.id, bot.displayName]))
  const children = new Map<string | null, ObjectiveRow[]>()

  for (const row of rows as ObjectiveRow[]) {
    const key = row.parentObjectiveId
    const bucket = children.get(key)
    if (bucket) bucket.push(row)
    else children.set(key, [row])
  }

  const lines: string[] = []

  const walk = (parentId: string | null, indent: number) => {
    for (const node of children.get(parentId) ?? []) {
      const owner = node.ownerBotId ? botName.get(node.ownerBotId) : null
      const attribution = [node.status, owner, node.assigneeSubAgentTitle]
        .filter(Boolean)
        .join(' · ')
      const prefix = '  '.repeat(indent)
      lines.push(
        `${prefix}- ${node.title} [${attribution || 'unassigned'}] ${node.progress}%`,
      )
      walk(node.id, indent + 1)
    }
  }

  walk(null, 0)

  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * Open L3/L4 gate requests. These are the decisions only the user can make, so
 * the orchestrator is told about them explicitly and told not to resolve them.
 */
export async function summarizePendingGates(
  projectId: string,
  userId: string,
): Promise<string | null> {
  const gates = await db
    .select({
      id: gateRequests.id,
      title: gateRequests.title,
      summary: gateRequests.summary,
      layer: gateRequests.layer,
      changeType: gateRequests.changeType,
      requestedByTitle: gateRequests.requestedByTitle,
      recommendation: gateRequests.recommendation,
      corroborationCount: gateRequests.corroborationCount,
      slaDueAt: gateRequests.slaDueAt,
      createdAt: gateRequests.createdAt,
    })
    .from(gateRequests)
    .where(
      and(
        eq(gateRequests.projectId, projectId),
        eq(gateRequests.userId, userId),
        eq(gateRequests.status, 'pending'),
      ),
    )
    .orderBy(desc(gateRequests.createdAt))

  if (gates.length === 0) return null

  return gates
    .map((gate) => {
      const layer = LAYER_LABELS[gate.layer as EscalationLayer] ?? gate.layer
      const parts = [
        `- ${gate.title} (${layer}, ${gate.changeType})`,
        `  Requested by: ${gate.requestedByTitle}`,
        `  Summary: ${gate.summary}`,
        `  Corroborating experiences: ${gate.corroborationCount}`,
      ]
      if (gate.recommendation) parts.push(`  Recommendation: ${gate.recommendation}`)
      if (gate.slaDueAt) parts.push(`  SLA due: ${gate.slaDueAt.toISOString()}`)
      return parts.join('\n')
    })
    .join('\n')
}

/** Recent Mycelium traffic, so the orchestrator can say what agents are doing. */
export async function summarizeRecentSignals(
  projectId: string,
  userId: string,
  limit = 15,
): Promise<string | null> {
  const signals = await db
    .select({
      fromTitle: myceliumSignals.fromTitle,
      toTitle: myceliumSignals.toTitle,
      signalKind: myceliumSignals.signalKind,
      body: myceliumSignals.body,
      firedAt: myceliumSignals.firedAt,
    })
    .from(myceliumSignals)
    .where(and(eq(myceliumSignals.projectId, projectId), eq(myceliumSignals.userId, userId)))
    .orderBy(desc(myceliumSignals.firedAt))
    .limit(limit)

  if (signals.length === 0) return null

  return signals
    .map(
      (signal) =>
        `- ${signal.firedAt.toISOString()} ${signal.fromTitle} → ${signal.toTitle} (${signal.signalKind}): ${signal.body}`,
    )
    .join('\n')
}

/** Tasks in flight for a project, newest first. */
export async function summarizeActiveTasks(
  projectId: string,
  userId: string,
  limit = 15,
): Promise<string | null> {
  const tasks = await db
    .select({
      title: subAgentTasks.title,
      subAgentTitle: subAgentTasks.subAgentTitle,
      status: subAgentTasks.status,
      validationResult: subAgentTasks.validationResult,
      outcomeScore: subAgentTasks.outcomeScore,
      progress: subAgentTasks.progress,
    })
    .from(subAgentTasks)
    .where(and(eq(subAgentTasks.projectId, projectId), eq(subAgentTasks.userId, userId)))
    .orderBy(desc(subAgentTasks.updatedAt))
    .limit(limit)

  if (tasks.length === 0) return null

  return tasks
    .map((task) => {
      const verdict = task.validationResult
        ? ` ${task.validationResult} (${task.outcomeScore ?? 0}/100)`
        : ''
      return `- ${task.title} — ${task.subAgentTitle} [${task.status}${verdict}] ${task.progress}%`
    })
    .join('\n')
}
