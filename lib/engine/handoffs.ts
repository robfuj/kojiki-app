import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { handoffRequests } from '@/lib/db/schema'
import {
  HANDOFF_REQUEST_ID,
  handoffSchemaKeySchema,
  validateHandoffPayload,
  type HandoffSchemaKey,
} from '@/lib/schemas/governance'
import { appendSentinelEntry } from '@/lib/sentinel'

/**
 * Agent-to-agent handoffs.
 *
 * A Mycelium *signal* says something: "this lead scored 0.9", "this task
 * finished". A *handoff* obliges someone: it names a receiver, carries a payload
 * that receiver must be able to act on, and is tracked until it closes. The
 * difference matters because a signal can be ignored without breaking anything,
 * while an unclosed handoff is work that was promised and never done.
 *
 * Two properties this module holds:
 *
 * 1. **The payload is validated before the receiver ever sees it.** A sender that
 *    cannot satisfy its own contract is rejected at send time. Otherwise a
 *    malformed handoff costs a full round trip to discover, and the receiver has
 *    already been told it has work.
 * 2. **Status only moves forward.** `sent -> received -> processing ->
 *    completed | closed | rejected`. A handoff cannot be un-received or reopened,
 *    because the point of the record is that it shows what actually happened.
 */

/** The forward-only status machine. */
const HANDOFF_TRANSITIONS: Record<string, readonly string[]> = {
  sent: ['received', 'rejected'],
  received: ['processing', 'rejected'],
  processing: ['completed', 'closed', 'rejected'],
  // Terminal. Nothing leaves these, which is what makes "closed" mean closed.
  completed: [],
  closed: [],
  rejected: [],
}

/** HAND-XXXXXXXXXX. */
function newHandoffId(): string {
  const digits = Array.from(
    { length: 10 },
    () => crypto.getRandomValues(new Uint32Array(1))[0] % 10,
  ).join('')
  return `HAND-${digits}`
}

export interface SendHandoffInput {
  userId: string
  projectId: string
  sourceAgent: string
  targetAgent: string
  /** What caused the handoff — the trigger is part of the record, not metadata. */
  trigger: string
  schemaKey: HandoffSchemaKey
  payload: Record<string, unknown>
  /** Optional link back to the signal that prompted this, if there was one. */
  signalId?: string | null
  objectiveId?: string | null
}

export class HandoffPayloadError extends Error {
  constructor(
    readonly schemaKey: string,
    readonly reason: string,
  ) {
    super(`Handoff payload does not satisfy ${schemaKey}: ${reason}`)
    this.name = 'HandoffPayloadError'
  }
}

export class HandoffTransitionError extends Error {
  constructor(
    readonly handoffId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Handoff ${handoffId} cannot move from '${from}' to '${to}'`)
    this.name = 'HandoffTransitionError'
  }
}

/**
 * Sends a handoff.
 *
 * Validation runs first and a failure throws rather than writing a rejected row.
 * That is deliberate: a rejected row would tell the receiver it has work before
 * telling it the work is unusable. The sender gets the error and can fix the
 * payload — nothing was promised, so nothing needs retracting.
 */
export async function sendHandoff(input: SendHandoffInput) {
  const schemaKey = handoffSchemaKeySchema.parse(input.schemaKey)

  const validated = validateHandoffPayload(schemaKey, input.payload)
  if (!validated.ok) {
    throw new HandoffPayloadError(schemaKey, validated.error)
  }

  const id = newHandoffId()
  const now = new Date()

  await db.insert(handoffRequests).values({
    id,
    userId: input.userId,
    projectId: input.projectId,
    sourceAgent: input.sourceAgent,
    targetAgent: input.targetAgent,
    trigger: input.trigger,
    schemaKey,
    // Store the parsed payload, not the raw one: defaults the contract supplies
    // (an empty keywords list, an empty checklist) become part of the record, so
    // the receiver reads what the contract guarantees rather than what the sender
    // happened to include.
    payload: validated.payload as Record<string, unknown>,
    status: 'sent',
    signalId: input.signalId ?? null,
    createdAt: now,
    updatedAt: now,
  })

  const entry = await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: 'handoff_sent',
    subjectKey: input.sourceAgent,
    subjectTitle: input.trigger,
    signer: input.sourceAgent,
    objectiveId: input.objectiveId ?? null,
    payloadRef: id,
    payload: {
      handoffId: id,
      schemaKey,
      from: input.sourceAgent,
      to: input.targetAgent,
      trigger: input.trigger,
      signalId: input.signalId ?? null,
    },
  })

  await db
    .update(handoffRequests)
    .set({ sentinelEntryId: entry.id })
    .where(eq(handoffRequests.id, id))

  return { id, status: 'sent' as const, schemaKey, sentinelEntryId: entry.id }
}

export interface AdvanceHandoffInput {
  userId: string
  projectId: string
  handoffId: string
  to: 'received' | 'processing' | 'completed' | 'closed' | 'rejected'
  /** Who moved it. Required — an anonymous transition is not auditable. */
  actor: string
  /** Required when rejecting: a refusal without a reason cannot be acted on. */
  reason?: string | null
}

/**
 * Moves a handoff forward.
 *
 * The transition table is the only authority on what may follow what, and a
 * terminal status has no successors — so a completed handoff cannot be reopened
 * and a rejected one cannot be quietly resumed. Rejection additionally requires a
 * reason, because the sender needs to know what to fix and "rejected" alone is
 * not an answer.
 */
export async function advanceHandoff(input: AdvanceHandoffInput) {
  if (!HANDOFF_REQUEST_ID.test(input.handoffId)) {
    throw new Error(`Malformed handoff id: ${input.handoffId}`)
  }

  const rows = await db
    .select()
    .from(handoffRequests)
    .where(
      and(
        eq(handoffRequests.id, input.handoffId),
        // Project-scoped: a guessed id from another project must not be movable.
        eq(handoffRequests.projectId, input.projectId),
        eq(handoffRequests.userId, input.userId),
      ),
    )
    .limit(1)

  const handoff = rows[0]
  if (!handoff) throw new Error(`Handoff ${input.handoffId} not found`)

  const allowed = HANDOFF_TRANSITIONS[handoff.status] ?? []
  if (!allowed.includes(input.to)) {
    throw new HandoffTransitionError(handoff.id, handoff.status, input.to)
  }

  if (input.to === 'rejected' && !input.reason?.trim()) {
    throw new Error('A rejected handoff must carry a reason')
  }

  const now = new Date()
  const terminal = ['completed', 'closed', 'rejected'].includes(input.to)

  await db
    .update(handoffRequests)
    .set({
      status: input.to,
      rejectionReason: input.to === 'rejected' ? (input.reason ?? null) : null,
      updatedAt: now,
      closedAt: terminal ? now : null,
    })
    .where(eq(handoffRequests.id, handoff.id))

  // Only closure is sealed. Intermediate moves are bookkeeping the row already
  // records; sealing each one would bury the two events that matter — that work
  // was promised, and how it ended.
  if (terminal) {
    const entry = await appendSentinelEntry({
      userId: input.userId,
      projectId: input.projectId,
      entryType: 'handoff_closed',
      subjectKey: handoff.targetAgent,
      subjectTitle: handoff.trigger,
      signer: input.actor,
      payloadRef: handoff.id,
      payload: {
        handoffId: handoff.id,
        schemaKey: handoff.schemaKey,
        from: handoff.sourceAgent,
        to: handoff.targetAgent,
        outcome: input.to,
        reason: input.to === 'rejected' ? (input.reason ?? null) : null,
        actor: input.actor,
        sentEntryId: handoff.sentinelEntryId,
      },
    })

    return { handoffId: handoff.id, status: input.to, entry }
  }

  return { handoffId: handoff.id, status: input.to, entry: null }
}

/**
 * Handoffs a receiver still owes.
 *
 * Anything not terminal is outstanding. This is the query that makes an unclosed
 * handoff visible rather than merely recorded — a promise nobody is tracking is
 * indistinguishable from a promise nobody made.
 */
export async function outstandingHandoffs(projectId: string, targetAgent: string) {
  const rows = await db
    .select()
    .from(handoffRequests)
    .where(
      and(
        eq(handoffRequests.projectId, projectId),
        eq(handoffRequests.targetAgent, targetAgent),
      ),
    )
    .orderBy(desc(handoffRequests.createdAt))

  return rows.filter((row) => !['completed', 'closed', 'rejected'].includes(row.status))
}

/** Full history between two agents, newest first. */
export async function handoffHistory(
  projectId: string,
  sourceAgent: string,
  targetAgent: string,
) {
  return db
    .select()
    .from(handoffRequests)
    .where(
      and(
        eq(handoffRequests.projectId, projectId),
        eq(handoffRequests.sourceAgent, sourceAgent),
        eq(handoffRequests.targetAgent, targetAgent),
      ),
    )
    .orderBy(desc(handoffRequests.createdAt))
}
