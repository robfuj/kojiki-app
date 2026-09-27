import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { myceliumSignals } from '@/lib/db/schema'
import {
  checkRight,
  DecisionRightDeniedError,
  type RightCheck,
} from '@/lib/engine/decision-rights'
import { reinforceEdge } from '@/lib/engine/registry'
import type { DecisionRightType } from '@/lib/schemas/governance'
import { appendSentinelEntry, type SentinelEntryType } from '@/lib/sentinel'

/**
 * MYCELIUM — the canopy tier every agent-to-agent conversation travels through.
 *
 * Agents never address each other directly. A department head dispatching a
 * sub-agent, a sub-agent reporting back, a head reabsorbing a result into the OKR
 * tree — each of those is a signal emitted here first. Two consequences the design
 * depends on:
 *
 *   1. Inter-agent traffic is observable. The sub-goal panel renders this table,
 *      so the user watches agents coordinate rather than trusting a summary.
 *   2. Every signal is sealed into SENTINEL as it propagates, so coordination
 *      leaves provenance behind it. An agent cannot claim it dispatched work it
 *      never dispatched, because the signal either exists in the chain or it does
 *      not.
 */

export type SignalKind = 'dispatch' | 'report' | 'reabsorb' | 'query' | 'answer'

export interface PropagateInput {
  userId: string
  projectId: string
  fromAgent: string
  fromTitle: string
  toAgent: string
  toTitle: string
  signalKind: SignalKind
  body: string
  payload?: Record<string, unknown>
  objectiveId?: string | null
  taskId?: string | null
  /**
   * What this signal means to the ledger. Dispatching work to a sub-agent is
   * the moment a node is brought in, so callers pass 'sub_agent_engaged' there
   * rather than the generic default.
   */
  entryType?: SentinelEntryType
}

export interface PropagatedSignal {
  id: string
  sentinelEntryId: string
  sequence: number
  entryHash: string
}

/**
 * Which right a signal kind exercises.
 *
 * Dispatching, reporting and reabsorbing are all acts of execution; querying and
 * answering are consultation. The baseline grant covers every one of these, so
 * ordinary coordination is unaffected — the gate bites only where a project has
 * narrowed an agent's rights, or where an agent reaches for `approve` or
 * `automate`, which the baseline never grants.
 */
const SIGNAL_RIGHT: Record<SignalKind, DecisionRightType> = {
  dispatch: 'execute',
  report: 'recommend',
  reabsorb: 'execute',
  query: 'consult',
  answer: 'consult',
}

/** The action a signal attempts, in the form a rights pattern is written against. */
function signalAction(input: PropagateInput): string {
  return `${input.signalKind}:${input.toAgent}`
}

/** Emits one signal and seals it into the project's provenance chain. */
export async function propagateSignal(
  input: PropagateInput,
): Promise<PropagatedSignal> {
  const id = crypto.randomUUID()
  const payload = input.payload ?? {}

  // The gate runs before anything is written. A denied signal is still recorded —
  // as DENIED, sealed under right_denied — because an agent that was refused
  // authority should leave a trace of having asked. What it must not do is route.
  const right = SIGNAL_RIGHT[input.signalKind]
  const action = signalAction(input)
  const check = await checkRight(input.projectId, input.fromAgent, action, right)

  if (!check.allowed) {
    await recordDeniedSignal(input, id, check, payload)
    throw new DecisionRightDeniedError(check)
  }

  await db.insert(myceliumSignals).values({
    id,
    userId: input.userId,
    projectId: input.projectId,
    objectiveId: input.objectiveId ?? null,
    taskId: input.taskId ?? null,
    fromAgent: input.fromAgent,
    fromTitle: input.fromTitle,
    toAgent: input.toAgent,
    toTitle: input.toTitle,
    signalKind: input.signalKind,
    status: 'ROUTED',
    body: input.body,
    payload,
  })

  const entry = await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: input.entryType ?? 'signal_propagated',
    subjectKey: `${input.fromAgent}->${input.toAgent}`,
    subjectTitle: `${input.fromTitle} → ${input.toTitle}`,
    // Attribution only: the emitting agent is named, but the runtime signed.
    signer: input.fromAgent,
    payload: {
      signalId: id,
      signalKind: input.signalKind,
      from: input.fromAgent,
      to: input.toAgent,
      body: input.body,
      ...payload,
    },
    payloadRef: id,
    objectiveId: input.objectiveId ?? null,
  })

  await db
    .update(myceliumSignals)
    .set({ sentinelEntryId: entry.id })
    .where(eq(myceliumSignals.id, id))

  // Every routed signal reinforces the mycelium edge between the two nodes —
  // how the registry learns which pathways carry traffic. Best-effort: projects
  // created before the registry existed have no nodes yet, and a missing edge
  // must never block the signal itself.
  await reinforceEdge({
    userId: input.userId,
    projectId: input.projectId,
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    signalId: id,
    triggerEvent: input.signalKind,
  }).catch((error: unknown) => {
    console.warn('[v0] edge reinforcement skipped:', error)
  })

  return {
    id,
    sentinelEntryId: entry.id,
    sequence: entry.sequence,
    entryHash: entry.entryHash,
  }
}

/**
 * Records a signal the gate refused, and seals the refusal.
 *
 * The row is written with status DENIED rather than dropped so the coordination
 * feed shows the attempt, and the seal is what makes the refusal durable: a
 * pattern of one agent repeatedly reaching for a right it does not hold is
 * evidence a governance gate can act on, and it survives the day.
 */
async function recordDeniedSignal(
  input: PropagateInput,
  id: string,
  check: RightCheck,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(myceliumSignals).values({
    id,
    userId: input.userId,
    projectId: input.projectId,
    objectiveId: input.objectiveId ?? null,
    taskId: input.taskId ?? null,
    fromAgent: input.fromAgent,
    fromTitle: input.fromTitle,
    toAgent: input.toAgent,
    toTitle: input.toTitle,
    signalKind: input.signalKind,
    status: 'DENIED',
    body: input.body,
    payload: { ...payload, deniedRight: check.right, denialReason: check.reason },
  })

  const entry = await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: 'right_denied',
    subjectKey: input.fromAgent,
    subjectTitle: input.fromTitle,
    signer: input.fromAgent,
    payload: {
      signalId: id,
      signalKind: input.signalKind,
      from: input.fromAgent,
      to: input.toAgent,
      right: check.right,
      action: check.action,
      rightsSource: check.source,
      reason: check.reason,
    },
    payloadRef: id,
    objectiveId: input.objectiveId ?? null,
  })

  await db
    .update(myceliumSignals)
    .set({ sentinelEntryId: entry.id })
    .where(eq(myceliumSignals.id, id))
}

/** Signals on one sub-goal, oldest first — the sub-goal panel's activity feed. */
export async function signalsForObjective(objectiveId: string) {
  const rows = await db
    .select()
    .from(myceliumSignals)
    .where(eq(myceliumSignals.objectiveId, objectiveId))
    .orderBy(myceliumSignals.firedAt)

  return rows
}

/** Signals on one task, oldest first. */
export async function signalsForTask(taskId: string) {
  return db
    .select()
    .from(myceliumSignals)
    .where(eq(myceliumSignals.taskId, taskId))
    .orderBy(myceliumSignals.firedAt)
}

/** The project's whole canopy traffic, newest first. */
export async function signalsForProject(projectId: string, limit = 100) {
  return db
    .select()
    .from(myceliumSignals)
    .where(and(eq(myceliumSignals.projectId, projectId)))
    .orderBy(desc(myceliumSignals.firedAt))
    .limit(limit)
}

/** Signals not tied to any sub-goal — project-wide coordination. */
export async function unscopedSignalsForProject(projectId: string, limit = 50) {
  return db
    .select()
    .from(myceliumSignals)
    .where(
      and(
        eq(myceliumSignals.projectId, projectId),
        isNull(myceliumSignals.objectiveId),
      ),
    )
    .orderBy(desc(myceliumSignals.firedAt))
    .limit(limit)
}
