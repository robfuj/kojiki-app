'use server'

import { generateText } from 'ai'
import { and, asc, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { resolveModel } from '@/lib/ai'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  gateRequests,
  myceliumSignals,
  objectives,
  projectBots,
  projects,
  subAgentTasks,
} from '@/lib/db/schema'
import {
  describeCheck,
  persistCheck,
  runCheck,
  type Guardrail,
  type SuccessCriterion,
} from '@/lib/kaizen'
import { propagateSignal, signalsForObjective } from '@/lib/mycelium'
import {
  decideGate,
  escalate,
  isTaskBlockedByGate,
  type ErrorClass,
  type EscalationLayer,
} from '@/lib/neuraxis'
import { buildSubAgentBrief } from '@/lib/ontology/brief'
import { getSubAgent, subAgentsOf } from '@/lib/ontology/specialists'
import { MAX_DEPTH, rollupAncestors } from '@/lib/okr-tree'
import { appendSentinelEntry } from '@/lib/sentinel'

/**
 * The execution flow: a department head reads a sub-goal, picks whichever of its
 * sub-agents the work needs, and hands each one a brief assembled from that
 * sub-agent's ontology entry. The sub-agent runs it. Kaizen checks the result
 * against criteria the head committed to before the work started. Neuraxis
 * escalates a failure to the layer that can fix it. The head then reabsorbs what
 * survived into the OKR tree, naming the sub-agent that did the work.
 */

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

async function assertProjectOwnership(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
  if (!project) throw new Error('Project not found')
  return project
}

export type TaskRow = typeof subAgentTasks.$inferSelect
export type SignalRow = typeof myceliumSignals.$inferSelect
export type GateRow = typeof gateRequests.$inferSelect

export interface SubGoalDetail {
  objective: typeof objectives.$inferSelect
  tasks: TaskRow[]
  signals: SignalRow[]
  gates: GateRow[]
}

/** Everything the sub-goal panel renders: the node, its tasks, and the traffic. */
export async function getSubGoalDetail(objectiveId: string): Promise<SubGoalDetail> {
  const userId = await getUserId()

  const [objective] = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, objectiveId), eq(objectives.userId, userId)))
    .limit(1)
  if (!objective) throw new Error('Goal not found')

  const [tasks, signals, gates] = await Promise.all([
    db
      .select()
      .from(subAgentTasks)
      .where(
        and(eq(subAgentTasks.objectiveId, objectiveId), eq(subAgentTasks.userId, userId)),
      )
      .orderBy(asc(subAgentTasks.position), asc(subAgentTasks.createdAt)),
    signalsForObjective(objectiveId),
    db
      .select()
      .from(gateRequests)
      .where(
        and(eq(gateRequests.objectiveId, objectiveId), eq(gateRequests.userId, userId)),
      )
      .orderBy(desc(gateRequests.createdAt)),
  ])

  return { objective, tasks, signals, gates }
}

const criterionSchema = z.object({
  metric: z.string().describe('Short name of the measurable, e.g. "organic_sessions"'),
  target: z.number().describe('Numeric target value'),
  operator: z
    .enum(['gte', 'lte', 'gt', 'lt', 'eq'])
    .describe('How the actual is compared to the target'),
  weight: z.number().min(1).max(10).describe('Relative importance, 1 to 10'),
  unit: z.string().optional().describe('Unit label, e.g. "sessions" or "percent"'),
})

const guardrailSchema = z.object({
  metric: z.string().describe('Short name of the constrained quantity'),
  limit: z.number().describe('Numeric limit'),
  operator: z.enum(['lte', 'gte']).describe('lte for a ceiling, gte for a floor'),
  note: z.string().optional().describe('Why this constraint exists'),
})

const assignmentSchema = z.object({
  assignments: z.array(
    z.object({
      subAgentKey: z
        .string()
        .describe('Key of the sub-agent to dispatch, exactly as listed in the roster'),
      title: z.string().describe('Short imperative task title'),
      instruction: z
        .string()
        .describe('What the department head wants back, in its own words'),
      successCriteria: z
        .array(criterionSchema)
        .min(1)
        .max(4)
        .describe('Measurable commitments defining done, set before the work starts'),
      guardrails: z
        .array(guardrailSchema)
        .max(3)
        .describe('Hard constraints; breaching one fails the attempt outright'),
      measurementWindowDays: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe('Days to wait before measuring, when the metric needs time to accrue'),
    }),
  ),
})

/**
 * Kaizen Plan, performed by the department head.
 *
 * The head reads the sub-goal, picks the sub-agents whose ontology entries cover
 * the work, and commits to success criteria *before* dispatching. That ordering is
 * the whole point: because the criteria exist before the result does, the
 * sub-agent cannot move the goalposts, and reabsorption becomes a comparison
 * rather than a judgement call.
 */
export async function assignSubAgents(input: {
  projectId: string
  objectiveId: string
}): Promise<TaskRow[]> {
  const userId = await getUserId()
  const project = await assertProjectOwnership(userId, input.projectId)

  const [objective] = await db
    .select()
    .from(objectives)
    .where(
      and(
        eq(objectives.id, input.objectiveId),
        eq(objectives.userId, userId),
        eq(objectives.projectId, input.projectId),
      ),
    )
    .limit(1)
  if (!objective) throw new Error('Goal not found')
  if (!objective.ownerBotId) {
    throw new Error('This goal has no owning department, so no head can dispatch work')
  }

  const [bot] = await db
    .select()
    .from(projectBots)
    .where(and(eq(projectBots.id, objective.ownerBotId), eq(projectBots.userId, userId)))
    .limit(1)
  if (!bot) throw new Error('Owning department agent not found')

  const roster = subAgentsOf(bot.specialistKey)
  if (roster.length === 0) {
    throw new Error(`${bot.displayName} has no sub-agents in the ontology`)
  }

  const rosterText = roster
    .map(
      (sub) =>
        `- ${sub.key}: ${sub.title} — ${sub.description}\n  skills: ${sub.skills.join(', ') || 'none'}`,
    )
    .join('\n')

  // generateObject sends a JSON-schema response format, which free-tier Gateway
  // providers reject. A required tool call carries the same schema through the
  // universally supported `tools` parameter instead.
  const { toolCalls } = await generateText({
    model: resolveModel(),
    tools: {
      dispatchSubAgents: {
        description:
          'Dispatch the sub-agents needed to deliver this sub-goal, each with success criteria fixed before the work begins.',
        inputSchema: assignmentSchema,
      },
    },
    toolChoice: 'required',
    prompt: [
      `You are the ${bot.displayName} department head in the Kojiki ontology, decomposing one of your sub-goals into sub-agent tasks.`,
      '',
      `Project: ${project.name}`,
      project.objective ? `Project objective: ${project.objective}` : '',
      `Sub-goal: ${objective.title}`,
      objective.description ? `Sub-goal detail: ${objective.description}` : '',
      '',
      'Your sub-agents (use subAgentKey exactly as written):',
      rosterText,
      '',
      'Rules:',
      '- Dispatch only the sub-agents this sub-goal actually needs. One to three is normal; do not dispatch the whole roster.',
      '- Each task title is short and imperative.',
      '- Success criteria are measurable and fixed now, before the work starts. Prefer quantities a reviewer could check over vague quality claims.',
      '- Weights express relative importance; they need not sum to anything in particular.',
      '- Add a guardrail only where there is a real constraint worth failing the attempt over, such as budget, latency, or compliance exposure.',
      '- Set measurementWindowDays only when the metric genuinely needs time to accrue.',
    ]
      .filter(Boolean)
      .join('\n'),
  })

  const proposal = toolCalls.find((call) => call.toolName === 'dispatchSubAgents')
  if (!proposal) throw new Error('The department head returned no dispatch proposal')
  const { assignments } = assignmentSchema.parse(proposal.input)

  if (assignments.length === 0) {
    throw new Error('The department head dispatched no sub-agents')
  }

  const existing = await db
    .select({ id: subAgentTasks.id })
    .from(subAgentTasks)
    .where(
      and(eq(subAgentTasks.objectiveId, input.objectiveId), eq(subAgentTasks.userId, userId)),
    )

  const created: TaskRow[] = []

  for (const [index, assignment] of assignments.entries()) {
    const sub = getSubAgent(bot.specialistKey, assignment.subAgentKey)
    if (!sub) {
      throw new Error(
        `${assignment.subAgentKey} is not a sub-agent of ${bot.displayName}`,
      )
    }

    const brief = buildSubAgentBrief(sub, {
      taskTitle: assignment.title,
      objectiveTitle: objective.title,
      projectObjective: project.objective,
      instruction: assignment.instruction,
    })

    const taskId = crypto.randomUUID()
    const criteria = assignment.successCriteria as SuccessCriterion[]
    const guardrails = assignment.guardrails as Guardrail[]

    // Dispatch is the moment a node is brought in, so the signal is sealed as a
    // sub-agent engagement rather than as generic traffic.
    await propagateSignal({
      userId,
      projectId: input.projectId,
      fromAgent: bot.specialistKey,
      fromTitle: bot.displayName,
      toAgent: `${bot.specialistKey}/${sub.key}`,
      toTitle: sub.title,
      signalKind: 'dispatch',
      body: `${assignment.title} — ${assignment.instruction}`,
      objectiveId: objective.id,
      taskId,
      entryType: 'sub_agent_engaged',
      payload: {
        taskId,
        brief,
        successCriteria: criteria,
        guardrails,
        measurementWindowDays: assignment.measurementWindowDays ?? null,
      },
    })

    const [task] = await db
      .insert(subAgentTasks)
      .values({
        id: taskId,
        userId,
        projectId: input.projectId,
        objectiveId: objective.id,
        assignedByBotId: bot.id,
        parentSpecialistKey: bot.specialistKey,
        subAgentKey: sub.key,
        subAgentTitle: sub.title,
        title: assignment.title.trim(),
        brief,
        skills: sub.skills,
        status: 'dispatched',
        successCriteria: criteria,
        guardrails,
        measurementWindowDays: assignment.measurementWindowDays ?? null,
        position: existing.length + index,
      })
      .returning()

    created.push(task)
  }

  await db
    .update(objectives)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(and(eq(objectives.id, objective.id), eq(objectives.userId, userId)))

  revalidatePath('/')
  return created
}

const reportSchema = z.object({
  resultSummary: z.string().describe('What was done and what was found, in a few sentences'),
  actuals: z
    .record(z.string(), z.number())
    .describe('Measured value for each success-criteria metric, keyed by metric name'),
  progress: z.number().int().min(0).max(100).describe('How much of the task is complete'),
  learningCase: z
    .string()
    .optional()
    .describe(
      'If a target was missed, what the attempt taught the department that is worth reusing. Omit if nothing was learned.',
    ),
  blockedBy: z
    .string()
    .optional()
    .describe('What prevented completion, if anything. Omit if the task completed.'),
})

/**
 * Do — the sub-agent runs its brief and reports back.
 *
 * The sub-agent reports actuals against criteria it did not set. That asymmetry is
 * deliberate: it may say what happened, but it may not redefine what success
 * meant. Check then compares mechanically.
 */
export async function runTask(input: { taskId: string }): Promise<TaskRow> {
  const userId = await getUserId()

  const [task] = await db
    .select()
    .from(subAgentTasks)
    .where(and(eq(subAgentTasks.id, input.taskId), eq(subAgentTasks.userId, userId)))
    .limit(1)
  if (!task) throw new Error('Task not found')

  if (await isTaskBlockedByGate(task.id)) {
    throw new Error(
      'This task is blocked by an open governance gate. The user must decide it first.',
    )
  }

  const [objective] = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, task.objectiveId), eq(objectives.userId, userId)))
    .limit(1)

  const [bot] = await db
    .select()
    .from(projectBots)
    .where(and(eq(projectBots.id, task.assignedByBotId), eq(projectBots.userId, userId)))
    .limit(1)

  const criteria = task.successCriteria as SuccessCriterion[]
  const criteriaText =
    criteria.length > 0
      ? criteria
          .map((c) => `- ${c.metric}: report a number for this (target ${c.operator} ${c.target})`)
          .join('\n')
      : '- No criteria were recorded; report what you can measure.'

  const { toolCalls } = await generateText({
    model: resolveModel(),
    // The brief IS the system prompt: what the user reads in the UI is exactly
    // what the agent was told.
    system: task.brief,
    tools: {
      reportResult: {
        description: 'Report the outcome of the assigned task against its success criteria.',
        inputSchema: reportSchema,
      },
    },
    toolChoice: 'required',
    prompt: [
      `You are the ${task.subAgentTitle}, working on: ${task.title}`,
      objective ? `Sub-goal this serves: ${objective.title}` : '',
      '',
      'Report honestly. You must supply a number for every metric below:',
      criteriaText,
      '',
      'Rules:',
      '- Report the actual value you would defend to a reviewer, not the value you hoped for.',
      '- If you missed a target, say so in resultSummary and fill learningCase with what the attempt taught the department.',
      '- If something outside your decision rights blocked you, name it in blockedBy rather than deciding it yourself.',
    ]
      .filter(Boolean)
      .join('\n'),
  })

  const report = toolCalls.find((call) => call.toolName === 'reportResult')
  if (!report) throw new Error('The sub-agent returned no report')
  const parsed = reportSchema.parse(report.input)

  await db
    .update(subAgentTasks)
    .set({
      status: 'reported',
      resultSummary: parsed.resultSummary,
      result: {
        actuals: parsed.actuals,
        blockedBy: parsed.blockedBy ?? null,
        learningCase: parsed.learningCase ?? null,
      },
      progress: parsed.progress,
      updatedAt: new Date(),
    })
    .where(and(eq(subAgentTasks.id, task.id), eq(subAgentTasks.userId, userId)))

  await propagateSignal({
    userId,
    projectId: task.projectId,
    fromAgent: `${task.parentSpecialistKey}/${task.subAgentKey}`,
    fromTitle: task.subAgentTitle,
    toAgent: task.parentSpecialistKey,
    toTitle: bot?.displayName ?? task.parentSpecialistKey,
    signalKind: 'report',
    body: parsed.resultSummary,
    objectiveId: task.objectiveId,
    taskId: task.id,
    entryType: 'task_reported',
    payload: { actuals: parsed.actuals, progress: parsed.progress },
  })

  revalidatePath('/')

  const [updated] = await db
    .select()
    .from(subAgentTasks)
    .where(eq(subAgentTasks.id, task.id))
    .limit(1)
  return updated
}

/**
 * Check — compares the reported actuals against the criteria fixed during Plan.
 *
 * Mechanical, not judgemental: the verdict follows from the comparison and from
 * whether a learning case was produced. A guardrail breach fails outright; a miss
 * with a reusable lesson is LEARNING rather than FAIL.
 */
export async function checkTask(input: {
  taskId: string
  learningCase?: string | null
}): Promise<TaskRow> {
  const userId = await getUserId()

  const [task] = await db
    .select()
    .from(subAgentTasks)
    .where(and(eq(subAgentTasks.id, input.taskId), eq(subAgentTasks.userId, userId)))
    .limit(1)
  if (!task) throw new Error('Task not found')
  if (task.status !== 'reported') {
    throw new Error('Only a reported task can be checked')
  }

  const result = (task.result ?? {}) as {
    actuals?: Record<string, number>
    learningCase?: string | null
  }

  const outcome = runCheck({
    criteria: task.successCriteria as SuccessCriterion[],
    guardrails: task.guardrails as Guardrail[],
    actuals: result.actuals ?? {},
    // An explicit learning case wins; otherwise fall back to what the sub-agent
    // itself reported, since it is the one that knows what it learned.
    learningCase: input.learningCase ?? result.learningCase ?? null,
  })

  await persistCheck({
    userId,
    projectId: task.projectId,
    taskId: task.id,
    objectiveId: task.objectiveId,
    agentKey: `${task.parentSpecialistKey}/${task.subAgentKey}`,
    agentTitle: task.subAgentTitle,
    outcome,
  })

  // Check is when evidence arrives, so the sub-goal's percentage moves here:
  // the verdict counts as a share of its sub-goal until reabsorption turns it
  // into a child node carrying the same score.
  await rollupAncestors(userId, task.objectiveId)

  const [bot] = await db
    .select()
    .from(projectBots)
    .where(and(eq(projectBots.id, task.assignedByBotId), eq(projectBots.userId, userId)))
    .limit(1)

  await propagateSignal({
    userId,
    projectId: task.projectId,
    fromAgent: task.parentSpecialistKey,
    fromTitle: bot?.displayName ?? task.parentSpecialistKey,
    toAgent: `${task.parentSpecialistKey}/${task.subAgentKey}`,
    toTitle: task.subAgentTitle,
    signalKind: 'answer',
    body: describeCheck(outcome),
    objectiveId: task.objectiveId,
    taskId: task.id,
    payload: { result: outcome.result, score: outcome.score },
  })

  revalidatePath('/')

  const [updated] = await db
    .select()
    .from(subAgentTasks)
    .where(eq(subAgentTasks.id, task.id))
    .limit(1)
  return updated
}

/**
 * Act — escalates a failed check to the layer that can fix it.
 *
 * L0-L2 resolve autonomously. L3 and L4 change an agent's own authority, so they
 * open a gate request and leave the task blocked until the user decides.
 */
export async function escalateTask(input: {
  taskId: string
  errorClass: ErrorClass
  redefinition?: string | null
  supersedes?: string | null
  reason?: string | null
  proposedChange?: Record<string, unknown>
  recommendation?: string | null
}): Promise<{ layer: EscalationLayer; autonomous: boolean; gateRequestId: string | null }> {
  const userId = await getUserId()

  const [task] = await db
    .select()
    .from(subAgentTasks)
    .where(and(eq(subAgentTasks.id, input.taskId), eq(subAgentTasks.userId, userId)))
    .limit(1)
  if (!task) throw new Error('Task not found')

  const result = (task.result ?? {}) as { actuals?: Record<string, number> }
  const observed =
    task.resultSummary ??
    Object.entries(result.actuals ?? {})
      .map(([metric, value]) => `${metric}=${value}`)
      .join(', ') ??
    'No result reported'

  const escalation = await escalate({
    userId,
    projectId: task.projectId,
    objectiveId: task.objectiveId,
    taskId: task.id,
    agentKey: `${task.parentSpecialistKey}/${task.subAgentKey}`,
    agentTitle: task.subAgentTitle,
    errorClass: input.errorClass,
    hypothesis: `Completing "${task.title}" would satisfy the sub-goal's success criteria.`,
    action: task.brief,
    expected: (task.successCriteria as SuccessCriterion[])
      .map((c) => `${c.metric} ${c.operator} ${c.target}`)
      .join('; '),
    observed,
    redefinition: input.redefinition ?? null,
    supersedes: input.supersedes ?? null,
    reason: input.reason ?? null,
    insight: ((task.result ?? {}) as { learningCase?: string | null }).learningCase ?? null,
    reusable: Boolean(((task.result ?? {}) as { learningCase?: string | null }).learningCase),
    proposedChange: input.proposedChange,
    recommendation: input.recommendation ?? null,
  })

  revalidatePath('/')
  return {
    layer: escalation.layer,
    autonomous: escalation.autonomous,
    gateRequestId: escalation.gateRequestId,
  }
}

/**
 * Reabsorption — the head folds a checked result back into the OKR tree.
 *
 * Gated on the Kaizen verdict: a PASS proposes a complete node, a LEARNING
 * proposes a partial one carrying the lesson, and a FAIL proposes nothing. A task
 * held by an open governance gate cannot be reabsorbed at all, which is what stops
 * an agent from banking work whose authority is still under review.
 */
export async function reabsorbTask(input: {
  taskId: string
}): Promise<typeof objectives.$inferSelect> {
  const userId = await getUserId()

  const [task] = await db
    .select()
    .from(subAgentTasks)
    .where(and(eq(subAgentTasks.id, input.taskId), eq(subAgentTasks.userId, userId)))
    .limit(1)
  if (!task) throw new Error('Task not found')

  if (await isTaskBlockedByGate(task.id)) {
    throw new Error(
      'This task is blocked by an open governance gate and cannot be reabsorbed until the user decides it.',
    )
  }

  if (task.validationResult === 'FAIL') {
    throw new Error('A failed task cannot be reabsorbed into the OKR tree')
  }
  if (!task.validationResult) {
    throw new Error('This task has not been checked yet')
  }
  if (task.reabsorbedAt) {
    throw new Error('This task has already been reabsorbed')
  }

  const [parent] = await db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, task.objectiveId), eq(objectives.userId, userId)))
    .limit(1)
  if (!parent) throw new Error('Parent goal not found')
  if (parent.depth >= MAX_DEPTH) {
    throw new Error(`Goal trees are limited to ${MAX_DEPTH + 1} levels`)
  }

  const siblings = await db
    .select({ id: objectives.id })
    .from(objectives)
    .where(
      and(
        eq(objectives.parentObjectiveId, parent.id),
        eq(objectives.userId, userId),
      ),
    )

  // A LEARNING result is real but partial, so the node carries the score it
  // actually earned rather than being marked complete.
  const progress = task.validationResult === 'PASS' ? 100 : (task.outcomeScore ?? 0)

  const [node] = await db
    .insert(objectives)
    .values({
      id: crypto.randomUUID(),
      userId,
      projectId: task.projectId,
      parentObjectiveId: parent.id,
      ownerBotId: task.assignedByBotId,
      // The sub-agent that did the work is named on the node, so the tree reads
      // as "proposed · Marketing · SEO Specialist" rather than as an anonymous
      // departmental claim.
      assigneeSubAgentKey: task.subAgentKey,
      assigneeSubAgentTitle: task.subAgentTitle,
      title: task.title,
      description: task.resultSummary,
      kind: 'sub_goal',
      status: 'proposed',
      progress,
      depth: parent.depth + 1,
      position: siblings.length,
    })
    .returning()

  await db
    .update(subAgentTasks)
    .set({
      status: 'reabsorbed',
      reabsorbedAt: new Date(),
      proposedObjectiveId: node.id,
      updatedAt: new Date(),
    })
    .where(and(eq(subAgentTasks.id, task.id), eq(subAgentTasks.userId, userId)))

  const [bot] = await db
    .select()
    .from(projectBots)
    .where(and(eq(projectBots.id, task.assignedByBotId), eq(projectBots.userId, userId)))
    .limit(1)

  await propagateSignal({
    userId,
    projectId: task.projectId,
    fromAgent: task.parentSpecialistKey,
    fromTitle: bot?.displayName ?? task.parentSpecialistKey,
    toAgent: 'okr-tree',
    toTitle: 'OKR Tree',
    signalKind: 'reabsorb',
    body: `${task.subAgentTitle} delivered "${task.title}" (${task.validationResult}, ${task.outcomeScore ?? 0}/100); proposed as a node under ${parent.title}.`,
    objectiveId: parent.id,
    taskId: task.id,
    entryType: 'task_reabsorbed',
    payload: { proposedObjectiveId: node.id, result: task.validationResult },
  })

  await appendSentinelEntry({
    userId,
    projectId: task.projectId,
    entryType: 'objective_proposed',
    subjectKey: `${task.parentSpecialistKey}/${task.subAgentKey}`,
    subjectTitle: task.subAgentTitle,
    signer: task.parentSpecialistKey,
    objectiveId: node.id,
    payloadRef: node.id,
    payload: {
      objectiveId: node.id,
      parentObjectiveId: parent.id,
      title: node.title,
      proposedBy: task.parentSpecialistKey,
      deliveredBy: task.subAgentKey,
      taskId: task.id,
      validationResult: task.validationResult,
      outcomeScore: task.outcomeScore,
    },
  })

  // Reabsorption moves the tree: the new node's progress rolls up through every
  // ancestor, including the root Overall Goal.
  await rollupAncestors(userId, parent.id)

  revalidatePath('/')
  return node
}

/** Open governance gates for a project — the decisions only the user can make. */
export async function getPendingGates(projectId: string): Promise<GateRow[]> {
  const userId = await getUserId()
  await assertProjectOwnership(userId, projectId)

  return db
    .select()
    .from(gateRequests)
    .where(
      and(
        eq(gateRequests.projectId, projectId),
        eq(gateRequests.userId, userId),
        eq(gateRequests.status, 'pending'),
      ),
    )
    .orderBy(desc(gateRequests.createdAt))
}

/**
 * Resolves a governance gate. There is no agent-facing path into this: an L3 or L4
 * change alters an agent's own authority, so only the user may approve it.
 */
export async function decideGateRequest(input: {
  gateRequestId: string
  decision: 'approved' | 'denied'
  note?: string | null
}): Promise<void> {
  const userId = await getUserId()
  await decideGate({
    userId,
    gateRequestId: input.gateRequestId,
    decision: input.decision,
    note: input.note ?? null,
  })
  revalidatePath('/')
}
