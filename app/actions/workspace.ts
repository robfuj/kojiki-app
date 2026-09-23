'use server'

/**
 * Read models for the workspace tabs.
 *
 * Each tab needs a different slice of the same underlying rows — objectives,
 * tasks, gates, signals, learnings — so the queries live here rather than in the
 * components, and every one of them is scoped by userId on every table it
 * touches. There is no RLS on Neon; the scoping is the boundary.
 */

import { requireUserId } from '@/lib/session'
import { db } from '@/lib/db'
import {
  decisions,
  gateRequests,
  kaizenExperiences,
  myceliumEdges,
  myceliumSignals,
  objectiveProgressHistory,
  objectives,
  projectBots,
  projects,
  subAgentTasks,
} from '@/lib/db/schema'
import { and, asc, desc, eq, inArray, like, or } from 'drizzle-orm'

const getUserId = requireUserId

export type SignalRow = typeof myceliumSignals.$inferSelect
export type GateRow = typeof gateRequests.$inferSelect

export interface PathRow {
  id: string
  fromAgent: string
  toAgent: string
  weight: string
  reciprocalExchanges: number
  oneDirectionalExchanges: number
  lastReinforced: Date | null
  triggerEvent: string | null
}

/**
 * The mycelium paths of one project. Edge endpoints are registry node keys
 * (`projectId:agentKey`), so the prefix both scopes the read to the project and
 * strips back down to the agent key the UI displays.
 */
export async function getProjectPaths(projectId: string): Promise<PathRow[]> {
  const userId = await getUserId()
  const prefix = `${projectId}:`

  const rows = await db
    .select()
    .from(myceliumEdges)
    .where(
      and(
        eq(myceliumEdges.userId, userId),
        or(
          like(myceliumEdges.fromKr, `${prefix}%`),
          like(myceliumEdges.toKr, `${prefix}%`),
        ),
      ),
    )
    .orderBy(desc(myceliumEdges.lastReinforced))
    .limit(40)

  return rows.map((row) => ({
    id: row.id,
    fromAgent: row.fromKr.slice(prefix.length),
    toAgent: row.toKr.slice(prefix.length),
    weight: row.weight,
    reciprocalExchanges: row.reciprocalExchanges,
    oneDirectionalExchanges: row.oneDirectionalExchanges,
    lastReinforced: row.lastReinforced,
    triggerEvent: row.triggerEvent,
  }))
}
export type DecisionRow = typeof decisions.$inferSelect
export type LearningRow = typeof kaizenExperiences.$inferSelect

async function assertProjectOwnership(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
  if (!project) throw new Error('Project not found')
  return project
}

/** The shape a success criterion carries in the task's jsonb. */
interface Criterion {
  metric: string
  target: number | string
  operator: string
  weight?: number
}

function actualsOf(task: {
  actuals: unknown
  result: unknown
}): Record<string, number> {
  // Check writes the measured values onto the task; before it runs they only
  // exist in what the sub-agent reported.
  const direct = task.actuals as Record<string, number> | null
  if (direct) return direct
  const result = (task.result ?? {}) as { actuals?: Record<string, number> }
  return result.actuals ?? {}
}

function meets(operator: string, actual: number, target: number): boolean {
  switch (operator) {
    case 'lte':
      return actual <= target
    case 'gt':
      return actual > target
    case 'lt':
      return actual < target
    case 'eq':
      return actual === target
    default:
      return actual >= target
  }
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export interface KeyResultRow {
  taskId: string
  taskTitle: string
  metric: string
  target: number
  operator: string
  weight: number
  actual: number | null
  met: boolean | null
}

export interface ProgressPoint {
  progress: number
  recordedAt: Date
}

export interface ObjectiveSummary {
  id: string
  title: string
  description: string | null
  status: string
  progress: number
  timeframe: string | null
  ownerBotId: string | null
  ownerName: string | null
  isRoot: boolean
  keyResults: KeyResultRow[]
  history: ProgressPoint[]
  taskCount: number
  doneTaskCount: number
}

export interface HomePayload {
  root: ObjectiveSummary | null
  objectives: ObjectiveSummary[]
}

/**
 * The Home tab payload: the company objective (the tree root) and the department
 * objectives one level beneath it, each with its key results, owner, and the
 * progress samples that draw its sparkline.
 */
export async function getHomePayload(projectId: string): Promise<HomePayload> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  const rows = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.projectId, projectId), eq(objectives.userId, userId)))
    .orderBy(asc(objectives.depth), asc(objectives.position), asc(objectives.createdAt))

  const bots = await db
    .select()
    .from(projectBots)
    .where(and(eq(projectBots.projectId, projectId), eq(projectBots.userId, userId)))
  const botNames = new Map(bots.map((bot) => [bot.id, bot.displayName]))

  const visible = rows.filter((row) => row.depth <= 1)
  const visibleIds = visible.map((row) => row.id)

  const tasks =
    visibleIds.length === 0
      ? []
      : await db
          .select()
          .from(subAgentTasks)
          .where(
            and(
              eq(subAgentTasks.userId, userId),
              inArray(subAgentTasks.objectiveId, visibleIds),
            ),
          )

  const historyRows =
    visibleIds.length === 0
      ? []
      : await db
          .select()
          .from(objectiveProgressHistory)
          .where(
            and(
              eq(objectiveProgressHistory.userId, userId),
              inArray(objectiveProgressHistory.objectiveId, visibleIds),
            ),
          )
          .orderBy(asc(objectiveProgressHistory.recordedAt))

  const historyByObjective = new Map<string, ProgressPoint[]>()
  for (const row of historyRows) {
    const list = historyByObjective.get(row.objectiveId) ?? []
    list.push({ progress: row.progress, recordedAt: row.recordedAt })
    historyByObjective.set(row.objectiveId, list)
  }

  function summarise(row: (typeof rows)[number]): ObjectiveSummary {
    const own = tasks.filter((task) => task.objectiveId === row.id)

    const keyResults: KeyResultRow[] = []
    for (const task of own) {
      const criteria = (task.successCriteria ?? []) as Criterion[]
      const actuals = actualsOf(task)
      for (const criterion of criteria) {
        const target = Number(criterion.target)
        const actual = actuals[criterion.metric]
        keyResults.push({
          taskId: task.id,
          taskTitle: task.title,
          metric: criterion.metric,
          target,
          operator: criterion.operator,
          weight: Number(criterion.weight ?? 1),
          actual: actual === undefined ? null : actual,
          met:
            actual === undefined || Number.isNaN(target)
              ? null
              : meets(criterion.operator, actual, target),
        })
      }
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      progress: row.progress,
      timeframe: row.timeframe,
      ownerBotId: row.ownerBotId,
      ownerName: row.ownerBotId ? (botNames.get(row.ownerBotId) ?? null) : null,
      isRoot: row.depth === 0,
      keyResults: keyResults.slice(0, 6),
      history: (historyByObjective.get(row.id) ?? []).slice(-20),
      taskCount: own.length,
      doneTaskCount: own.filter(
        (task) => task.validationResult === 'PASS' || task.status === 'reabsorbed',
      ).length,
    }
  }

  const root = visible.find((row) => row.depth === 0) ?? null

  return {
    root: root ? summarise(root) : null,
    objectives: visible.filter((row) => row.depth === 1).map(summarise),
  }
}

/** The measured criteria of one objective, at any depth in the tree. */
export async function getObjectiveKeyResults(
  objectiveId: string,
): Promise<KeyResultRow[]> {
  const userId = await getUserId()

  const [objective] = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, objectiveId), eq(objectives.userId, userId)))
    .limit(1)
  if (!objective) throw new Error('Objective not found')

  const tasks = await db
    .select()
    .from(subAgentTasks)
    .where(
      and(eq(subAgentTasks.userId, userId), eq(subAgentTasks.objectiveId, objectiveId)),
    )

  const rows: KeyResultRow[] = []
  for (const task of tasks) {
    const criteria = (task.successCriteria ?? []) as Criterion[]
    const actuals = actualsOf(task)
    for (const criterion of criteria) {
      const target = Number(criterion.target)
      const actual = actuals[criterion.metric]
      rows.push({
        taskId: task.id,
        taskTitle: task.title,
        metric: criterion.metric,
        target,
        operator: criterion.operator,
        weight: Number(criterion.weight ?? 1),
        actual: actual === undefined ? null : actual,
        met:
          actual === undefined || Number.isNaN(target)
            ? null
            : meets(criterion.operator, actual, target),
      })
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export interface DepartmentObjective {
  id: string
  title: string
  status: string
  progress: number
}

export interface DepartmentTask {
  id: string
  title: string
  status: string
  subAgentTitle: string
  objectiveId: string
  validationResult: string | null
}

export interface DepartmentWork {
  botId: string
  displayName: string
  specialistKey: string
  functionLine: string
  mandate: string | null
  objectives: DepartmentObjective[]
  tasks: DepartmentTask[]
  signals: SignalRow[]
  pendingGates: number
}

/** Everything the Departments tab shows, in one pass over the project's rows. */
export async function listDepartmentWork(projectId: string): Promise<DepartmentWork[]> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  const bots = await db
    .select()
    .from(projectBots)
    .where(and(eq(projectBots.projectId, projectId), eq(projectBots.userId, userId)))
    .orderBy(asc(projectBots.position))
  if (bots.length === 0) return []

  const [allObjectives, allTasks, allSignals, allGates] = await Promise.all([
    db
      .select({
        id: objectives.id,
        title: objectives.title,
        status: objectives.status,
        progress: objectives.progress,
        ownerBotId: objectives.ownerBotId,
      })
      .from(objectives)
      .where(and(eq(objectives.projectId, projectId), eq(objectives.userId, userId))),
    db
      .select({
        id: subAgentTasks.id,
        title: subAgentTasks.title,
        status: subAgentTasks.status,
        subAgentTitle: subAgentTasks.subAgentTitle,
        objectiveId: subAgentTasks.objectiveId,
        validationResult: subAgentTasks.validationResult,
        assignedByBotId: subAgentTasks.assignedByBotId,
      })
      .from(subAgentTasks)
      .where(and(eq(subAgentTasks.projectId, projectId), eq(subAgentTasks.userId, userId))),
    db
      .select()
      .from(myceliumSignals)
      .where(and(eq(myceliumSignals.projectId, projectId), eq(myceliumSignals.userId, userId)))
      .orderBy(desc(myceliumSignals.firedAt))
      .limit(200),
    db
      .select({
        id: gateRequests.id,
        requestedByAgent: gateRequests.requestedByAgent,
        status: gateRequests.status,
      })
      .from(gateRequests)
      .where(and(eq(gateRequests.projectId, projectId), eq(gateRequests.userId, userId))),
  ])

  return bots.map((bot) => ({
    botId: bot.id,
    displayName: bot.displayName,
    specialistKey: bot.specialistKey,
    functionLine: bot.functionLine,
    mandate: bot.mandate,
    objectives: allObjectives
      .filter((objective) => objective.ownerBotId === bot.id)
      .map((objective) => ({
        id: objective.id,
        title: objective.title,
        status: objective.status,
        progress: objective.progress,
      })),
    tasks: allTasks
      .filter((task) => task.assignedByBotId === bot.id)
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        subAgentTitle: task.subAgentTitle,
        objectiveId: task.objectiveId,
        validationResult: task.validationResult,
      })),
    signals: allSignals
      .filter(
        (signal) =>
          signal.fromAgent === bot.specialistKey || signal.toAgent === bot.specialistKey,
      )
      .slice(0, 8),
    pendingGates: allGates.filter(
      (gate) => gate.requestedByAgent === bot.specialistKey && gate.status === 'pending',
    ).length,
  }))
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

/** The learnings Kaizen marked as worth carrying forward. */
export async function listReusableLearnings(projectId: string): Promise<LearningRow[]> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  return db
    .select()
    .from(kaizenExperiences)
    .where(
      and(
        eq(kaizenExperiences.projectId, projectId),
        eq(kaizenExperiences.userId, userId),
        eq(kaizenExperiences.reusable, true),
      ),
    )
    .orderBy(desc(kaizenExperiences.recordedAt))
    .limit(50)
}

/** Every Kaizen experience in the project — the Learning tab's raw material. */
export async function listProjectLearnings(projectId: string): Promise<LearningRow[]> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  return db
    .select()
    .from(kaizenExperiences)
    .where(
      and(eq(kaizenExperiences.projectId, projectId), eq(kaizenExperiences.userId, userId)),
    )
    .orderBy(desc(kaizenExperiences.recordedAt))
    .limit(100)
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export async function listProjectDecisions(projectId: string): Promise<DecisionRow[]> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  return db
    .select()
    .from(decisions)
    .where(and(eq(decisions.projectId, projectId), eq(decisions.userId, userId)))
    .orderBy(desc(decisions.createdAt))
    .limit(100)
}

export async function listProjectGates(projectId: string): Promise<GateRow[]> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  return db
    .select()
    .from(gateRequests)
    .where(and(eq(gateRequests.projectId, projectId), eq(gateRequests.userId, userId)))
    .orderBy(desc(gateRequests.createdAt))
    .limit(100)
}

// ---------------------------------------------------------------------------
// Orchestrator rail
// ---------------------------------------------------------------------------

export async function listRecentSignals(projectId: string): Promise<SignalRow[]> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  return db
    .select()
    .from(myceliumSignals)
    .where(and(eq(myceliumSignals.projectId, projectId), eq(myceliumSignals.userId, userId)))
    .orderBy(desc(myceliumSignals.firedAt))
    .limit(12)
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface DepartmentReportLine {
  displayName: string
  taskCount: number
  passCount: number
  costUsd: number
}

export interface ProjectReport {
  objectiveCount: number
  objectivesByStatus: Record<string, number>
  averageProgress: number
  rootProgress: number | null
  taskCount: number
  tasksByStatus: Record<string, number>
  tasksByVerdict: Record<string, number>
  totalCostUsd: number
  totalTokens: number
  gatesPending: number
  gatesDecided: number
  signalsByKind: Record<string, number>
  learningsCount: number
  reusableLearningsCount: number
  progressHistory: ProgressPoint[]
  perDepartment: DepartmentReportLine[]
}

/** Every number the Reports tab shows, aggregated server-side in one pass. */
export async function getProjectReport(projectId: string): Promise<ProjectReport> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  const [rows, bots, tasks, gates, signals, learnings] = await Promise.all([
    db
      .select()
      .from(objectives)
      .where(and(eq(objectives.projectId, projectId), eq(objectives.userId, userId))),
    db
      .select()
      .from(projectBots)
      .where(and(eq(projectBots.projectId, projectId), eq(projectBots.userId, userId))),
    db
      .select()
      .from(subAgentTasks)
      .where(and(eq(subAgentTasks.projectId, projectId), eq(subAgentTasks.userId, userId))),
    db
      .select({ status: gateRequests.status })
      .from(gateRequests)
      .where(and(eq(gateRequests.projectId, projectId), eq(gateRequests.userId, userId))),
    db
      .select({ signalKind: myceliumSignals.signalKind })
      .from(myceliumSignals)
      .where(and(eq(myceliumSignals.projectId, projectId), eq(myceliumSignals.userId, userId))),
    db
      .select({ reusable: kaizenExperiences.reusable })
      .from(kaizenExperiences)
      .where(and(eq(kaizenExperiences.projectId, projectId), eq(kaizenExperiences.userId, userId))),
  ])

  const root = rows.find((row) => row.depth === 0) ?? null

  const history = root
    ? await db
        .select({
          progress: objectiveProgressHistory.progress,
          recordedAt: objectiveProgressHistory.recordedAt,
        })
        .from(objectiveProgressHistory)
        .where(
          and(
            eq(objectiveProgressHistory.objectiveId, root.id),
            eq(objectiveProgressHistory.userId, userId),
          ),
        )
        .orderBy(asc(objectiveProgressHistory.recordedAt))
    : []

  function tally(values: string[]): Record<string, number> {
    const out: Record<string, number> = {}
    for (const value of values) out[value] = (out[value] ?? 0) + 1
    return out
  }

  const botNames = new Map(bots.map((bot) => [bot.id, bot.displayName]))
  const perDepartment = bots.map((bot) => {
    const own = tasks.filter((task) => task.assignedByBotId === bot.id)
    return {
      displayName: bot.displayName,
      taskCount: own.length,
      passCount: own.filter((task) => task.validationResult === 'PASS').length,
      costUsd: own.reduce((sum, task) => sum + (task.actualCostUsd ?? 0), 0),
    }
  })

  return {
    objectiveCount: rows.length,
    objectivesByStatus: tally(rows.map((row) => row.status)),
    averageProgress:
      rows.length === 0
        ? 0
        : Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length),
    rootProgress: root?.progress ?? null,
    taskCount: tasks.length,
    tasksByStatus: tally(tasks.map((task) => task.status)),
    tasksByVerdict: tally(
      tasks.map((task) => task.validationResult ?? 'unchecked').filter(Boolean),
    ),
    totalCostUsd: tasks.reduce((sum, task) => sum + (task.actualCostUsd ?? 0), 0),
    totalTokens: tasks.reduce(
      (sum, task) => sum + (task.actualInputTokens ?? 0) + (task.actualOutputTokens ?? 0),
      0,
    ),
    gatesPending: gates.filter((gate) => gate.status === 'pending').length,
    gatesDecided: gates.filter((gate) => gate.status !== 'pending').length,
    signalsByKind: tally(signals.map((signal) => signal.signalKind)),
    learningsCount: learnings.length,
    reusableLearningsCount: learnings.filter((learning) => learning.reusable).length,
    progressHistory: history.slice(-40),
    perDepartment,
  }
}
