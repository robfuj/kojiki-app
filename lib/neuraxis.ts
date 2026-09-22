import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { gateRequests, neuraxisEscalations, subAgentTasks } from '@/lib/db/schema'
import { countCorroboratingExperiences, recordExperience } from '@/lib/kaizen'
import { recordGovernanceChange } from '@/lib/engine/causal'
import { appendSentinelEntry } from '@/lib/sentinel'

/**
 * NEURAXIS — the vertical axis: recursive problem redefinition.
 *
 * Where MYCELIUM moves work sideways between departments, Neuraxis moves a failure
 * upwards through layers of abstraction until it reaches a layer that can actually
 * fix it. A missed target is not always an execution problem; sometimes the
 * reasoning was wrong, sometimes the assumption underneath the reasoning was
 * wrong, and sometimes the ontology the agent is operating within is wrong.
 *
 * The containment property this layer exists to provide: an agent may redefine its
 * own *problem* autonomously, but it may never redefine its own *authority*.
 * L0-L2 are autonomous and bounded. L3 (ontology) and L4 (meta-strategy) change
 * what an agent is allowed to decide, so they raise a gate request that blocks
 * until the user approves it. Paired with SENTINEL — which makes the record
 * immutable — an agent can neither rewrite what it did nor quietly expand what it
 * may do.
 */

// The enums and their labels live in a client-safe module so the UI can render
// them without importing the server runtime. Re-exported here so callers on the
// server keep one import path, and so the two can never drift apart.
export {
  AUTONOMOUS_LAYERS,
  GOVERNANCE_LAYERS,
  LAYER_LABELS,
  type ErrorClass,
  type EscalationLayer,
} from '@/lib/agent-labels'

import {
  AUTONOMOUS_LAYERS,
  GOVERNANCE_LAYERS,
  LAYER_LABELS,
  type ErrorClass,
  type EscalationLayer,
} from '@/lib/agent-labels'

const ERROR_CLASS_TO_LAYER: Record<ErrorClass, EscalationLayer> = {
  // Missing or wrong data, and a plan that simply did not get carried out, are
  // both fixable at the layer that acted.
  information: 'L0',
  execution: 'L0',
  // The data was fine but the inference from it was not.
  reasoning: 'L1',
  // The inference was sound given a premise that turned out to be false. L2
  // supersedes the problem statement itself, with lineage.
  assumption: 'L2',
  // The categories the agent reasons in are wrong. Changing them changes what
  // every agent in the department may decide — hence the gate.
  model: 'L3',
  // The strategy for choosing strategies is wrong.
  meta: 'L4',
}

export function layerForErrorClass(errorClass: ErrorClass): EscalationLayer {
  return ERROR_CLASS_TO_LAYER[errorClass]
}

export function isAutonomous(layer: EscalationLayer): boolean {
  return AUTONOMOUS_LAYERS.includes(layer)
}

export function isGovernanceLayer(layer: EscalationLayer): boolean {
  return GOVERNANCE_LAYERS.includes(layer)
}

/** How long a gate request waits for a decision before it is flagged as breached. */
const GATE_SLA_DAYS = 7

export interface EscalateInput {
  userId: string
  projectId: string
  objectiveId?: string | null
  taskId?: string | null
  agentKey: string
  agentTitle: string
  errorClass: ErrorClass
  hypothesis: string
  action: string
  expected: string
  observed: string
  /** Required for L2: the bounded restatement of the problem. */
  redefinition?: string | null
  supersedes?: string | null
  reason?: string | null
  insight?: string | null
  reusable?: boolean
  /** Governance layers only: what would change if approved. */
  proposedChange?: Record<string, unknown>
  recommendation?: string | null
  consult?: string[]
  approveRole?: string | null
}

export interface EscalationResult {
  escalationId: string
  layer: EscalationLayer
  autonomous: boolean
  /** Present only when the layer required a gate; the task blocks on it. */
  gateRequestId: string | null
  experienceId: string
}

/**
 * Classifies a failure and escalates it to the layer that can fix it.
 *
 * Always records the causal trace first — the trace is the evidence, and the
 * escalation is a claim resting on it. For L3/L4 the function then opens a gate
 * request and returns it; the caller must treat the task as blocked until the
 * user decides. Nothing here self-applies a change to an agent's authority.
 */
export async function escalate(input: EscalateInput): Promise<EscalationResult> {
  const layer = layerForErrorClass(input.errorClass)
  const autonomous = isAutonomous(layer)

  const experience = await recordExperience({
    userId: input.userId,
    projectId: input.projectId,
    objectiveId: input.objectiveId ?? null,
    taskId: input.taskId ?? null,
    agentKey: input.agentKey,
    agentTitle: input.agentTitle,
    hypothesis: input.hypothesis,
    action: input.action,
    expected: input.expected,
    observed: input.observed,
    errorClass: input.errorClass,
    escalationLayer: layer,
    redefinition: input.redefinition ?? null,
    supersedes: input.supersedes ?? null,
    reason: input.reason ?? null,
    insight: input.insight ?? null,
    reusable: input.reusable ?? false,
  })

  const escalationId = crypto.randomUUID()
  const summary = `${input.errorClass} failure escalated to ${layer} (${LAYER_LABELS[layer]})`

  const escalationEntry = await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: 'escalation_raised',
    subjectKey: input.agentKey,
    subjectTitle: input.agentTitle,
    signer: 'neuraxis',
    objectiveId: input.objectiveId ?? null,
    payloadRef: escalationId,
    payload: {
      escalationId,
      experienceId: experience.id,
      taskId: input.taskId ?? null,
      errorClass: input.errorClass,
      layer,
      autonomous,
      redefinition: input.redefinition ?? null,
      supersedes: input.supersedes ?? null,
      reason: input.reason ?? null,
    },
  })

  await db.insert(neuraxisEscalations).values({
    id: escalationId,
    userId: input.userId,
    projectId: input.projectId,
    objectiveId: input.objectiveId ?? null,
    taskId: input.taskId ?? null,
    experienceId: experience.id,
    agentKey: input.agentKey,
    agentTitle: input.agentTitle,
    errorClass: input.errorClass,
    layer,
    autonomous,
    summary,
    redefinition: input.redefinition ?? null,
    supersedes: input.supersedes ?? null,
    reason: input.reason ?? null,
    // An autonomous escalation is resolved by the agent acting at that layer. A
    // governance escalation stays open until the gate decides.
    status: autonomous ? 'resolved' : 'awaiting_gate',
    sentinelEntryId: escalationEntry.id,
  })

  if (autonomous) {
    if (input.taskId) {
      await db
        .update(subAgentTasks)
        .set({
          errorClass: input.errorClass,
          escalationLayer: layer,
          escalationId,
          updatedAt: new Date(),
        })
        .where(eq(subAgentTasks.id, input.taskId))
    }

    return {
      escalationId,
      layer,
      autonomous: true,
      gateRequestId: null,
      experienceId: experience.id,
    }
  }

  // L3/L4: the change touches an agent's authority, so it blocks on the user.
  const corroborationCount = await countCorroboratingExperiences(
    input.projectId,
    input.agentKey,
    input.errorClass,
  )

  const gateRequestId = crypto.randomUUID()
  const changeType = layer === 'L3' ? 'ontology' : 'meta_strategy'
  const title = `${LAYER_LABELS[layer]} change requested by ${input.agentTitle}`

  const gateEntry = await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: 'gate_requested',
    subjectKey: input.agentKey,
    subjectTitle: input.agentTitle,
    signer: 'neuraxis',
    objectiveId: input.objectiveId ?? null,
    payloadRef: gateRequestId,
    payload: {
      gateRequestId,
      escalationId,
      changeType,
      layer,
      corroborationCount,
      proposedChange: input.proposedChange ?? {},
      recommendation: input.recommendation ?? null,
    },
  })

  const slaDueAt = new Date()
  slaDueAt.setDate(slaDueAt.getDate() + GATE_SLA_DAYS)

  await db.insert(gateRequests).values({
    id: gateRequestId,
    userId: input.userId,
    projectId: input.projectId,
    objectiveId: input.objectiveId ?? null,
    taskId: input.taskId ?? null,
    escalationId,
    changeType,
    layer,
    requestedByAgent: input.agentKey,
    requestedByTitle: input.agentTitle,
    title,
    summary,
    proposedChange: input.proposedChange ?? {},
    recommendation: input.recommendation ?? null,
    consult: input.consult ?? [],
    approveRole: input.approveRole ?? null,
    corroborationCount,
    status: 'pending',
    slaDueAt,
    sentinelEntryId: gateEntry.id,
  })

  await db
    .update(neuraxisEscalations)
    .set({ gateRequestId })
    .where(eq(neuraxisEscalations.id, escalationId))

  if (input.taskId) {
    await db
      .update(subAgentTasks)
      .set({
        errorClass: input.errorClass,
        escalationLayer: layer,
        escalationId,
        gateRequestId,
        // The task cannot be reabsorbed while a governance gate is open.
        status: 'blocked',
        updatedAt: new Date(),
      })
      .where(eq(subAgentTasks.id, input.taskId))
  }

  return {
    escalationId,
    layer,
    autonomous: false,
    gateRequestId,
    experienceId: experience.id,
  }
}

export interface DecideGateInput {
  userId: string
  gateRequestId: string
  decision: 'approved' | 'denied'
  note?: string | null
}

/**
 * Resolves a gate request. Only the user calls this — there is no agent-facing
 * path into it, which is the whole point of the gate.
 *
 * A denial sends the task back to an autonomous layer rather than leaving it
 * stranded: the agent must find an L0-L2 route or stop.
 */
export async function decideGate(input: DecideGateInput) {
  const { userId, gateRequestId, decision } = input

  const [gate] = await db
    .select()
    .from(gateRequests)
    .where(and(eq(gateRequests.id, gateRequestId), eq(gateRequests.userId, userId)))
    .limit(1)

  if (!gate) throw new Error('Gate request not found')
  if (gate.status !== 'pending') throw new Error('Gate request already decided')

  const decidedAt = new Date()

  await db
    .update(gateRequests)
    .set({
      status: 'decided',
      decision,
      decisionNote: input.note ?? null,
      decidedAt,
    })
    .where(eq(gateRequests.id, gateRequestId))

  if (gate.escalationId) {
    await db
      .update(neuraxisEscalations)
      .set({ status: decision === 'approved' ? 'approved' : 'denied' })
      .where(eq(neuraxisEscalations.id, gate.escalationId))
  }

  await appendSentinelEntry({
    userId,
    projectId: gate.projectId,
    entryType: 'gate_decided',
    subjectKey: gate.requestedByAgent,
    subjectTitle: gate.requestedByTitle,
    // The user is the signer of record for a gate decision: this is the one place
    // authority genuinely changes, and it is attributed to the human.
    signer: 'user',
    objectiveId: gate.objectiveId,
    payloadRef: gateRequestId,
    payload: {
      gateRequestId,
      escalationId: gate.escalationId,
      changeType: gate.changeType,
      layer: gate.layer,
      decision,
      note: input.note ?? null,
    },
  })

  // The governance record: every authority change as a JSONB payload with its
  // approver, mirroring the upstream engine's governance_changes table.
  await recordGovernanceChange({
    userId,
    projectId: gate.projectId,
    changeType: gate.changeType,
    target: gateRequestId,
    payload: {
      decision,
      note: input.note ?? null,
      layer: gate.layer,
      escalationId: gate.escalationId,
      requestedBy: gate.requestedByAgent,
    },
    reason: input.note ?? null,
    gateId: gateRequestId,
    approver: 'user',
  })

  if (gate.taskId) {
    await db
      .update(subAgentTasks)
      .set({
        // Approved: the change applies and the task resumes. Denied: the task
        // returns to the head, which must find an autonomous route or stop.
        status: decision === 'approved' ? 'checked' : 'returned',
        updatedAt: decidedAt,
      })
      .where(eq(subAgentTasks.id, gate.taskId))
  }

  return { gateRequestId, decision }
}

/** Open gate requests for a project, newest first. */
export async function pendingGatesForProject(projectId: string, userId: string) {
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

/** Every gate request for a project, decided or not — the authority audit trail. */
export async function gatesForProject(projectId: string, userId: string) {
  return db
    .select()
    .from(gateRequests)
    .where(and(eq(gateRequests.projectId, projectId), eq(gateRequests.userId, userId)))
    .orderBy(desc(gateRequests.createdAt))
}

/** True when a task is held by an undecided governance gate. */
export async function isTaskBlockedByGate(taskId: string): Promise<boolean> {
  const [task] = await db
    .select({ gateRequestId: subAgentTasks.gateRequestId })
    .from(subAgentTasks)
    .where(eq(subAgentTasks.id, taskId))
    .limit(1)

  if (!task?.gateRequestId) return false

  const [gate] = await db
    .select({ status: gateRequests.status })
    .from(gateRequests)
    .where(eq(gateRequests.id, task.gateRequestId))
    .limit(1)

  return gate?.status === 'pending'
}
