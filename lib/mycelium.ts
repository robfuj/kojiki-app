import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { myceliumSignals } from '@/lib/db/schema'
import { reinforceEdge } from '@/lib/engine/registry'
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

/** Emits one signal and seals it into the project's provenance chain. */
export async function propagateSignal(
  input: PropagateInput,
): Promise<PropagatedSignal> {
  const id = crypto.randomUUID()
  const payload = input.payload ?? {}

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
