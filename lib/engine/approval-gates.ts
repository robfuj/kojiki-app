import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { approvalRequests } from '@/lib/db/schema'
import {
  APPROVAL_REQUEST_ID,
  AUTO_APPROVAL_CONFIDENCE,
  MAX_APPROVAL_RETRIES,
  approvalDecisionSchema,
  type ApprovalChannel,
} from '@/lib/schemas/governance'
import { appendSentinelEntry } from '@/lib/sentinel'

/**
 * Approval gates for orchestration results.
 *
 * `gate_requests` is the ontology-change gate — it asks whether the organisation
 * itself may change. This is the other gate: it asks whether a *result* may be
 * acted on. Both exist because they fail differently. An ontology change that
 * slips through reshapes every later decision; a result that slips through
 * affects one outcome. Neither is safe to auto-accept, but only one needs the
 * full ontology review.
 *
 * The invariant this module exists to hold: **an unanswered gate is a refusal.**
 * A pending request that expires becomes `expired`, and every consumer treats
 * that as "not approved". There is no path by which silence becomes consent —
 * not by timeout, not by retry exhaustion, not by a missing webhook. Upstream's
 * `cli` channel is deliberately absent here for the same reason: on Vercel there
 * is no terminal to answer it, so offering it would manufacture gates that can
 * only ever expire.
 */

/** How long a gate stays open before it closes itself, refused. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

/** APPR-XXXXXXXXXX. Digits only, so the id reads the same in a log and a URL. */
function newApprovalId(): string {
  const digits = Array.from(
    { length: 10 },
    () => crypto.getRandomValues(new Uint32Array(1))[0] % 10,
  ).join('')
  return `APPR-${digits}`
}

export interface RequestApprovalInput {
  userId: string
  projectId: string
  orchestrationId?: string | null
  channel: ApprovalChannel
  title: string
  summary?: string | null
  payload?: Record<string, unknown>
  /**
   * The agent's own confidence in the result, 0-1. Only the `auto` channel reads
   * it, and only to decide whether the gate may close itself.
   */
  confidence?: number | null
  webhookUrl?: string | null
  ttlMs?: number
  /** Who is asking. Sealed as the signer so a gate names its requester. */
  requestedBy: string
  objectiveId?: string | null
}

export interface ApprovalRecord {
  id: string
  status: string
  channel: ApprovalChannel
  /** True when the gate closed itself on confidence rather than waiting. */
  selfApproved: boolean
  expiresAt: Date
  sentinelEntryId: string
}

/**
 * Opens a gate.
 *
 * Channel resolution happens here, once, and is recorded — so a later reader can
 * tell a gate that was answered from one that answered itself. The `auto`
 * channel is the only one that can close a gate without a human, and it needs
 * confidence at or above AUTO_APPROVAL_CONFIDENCE to do it. Below that threshold
 * an `auto` request does not quietly become an approval; it stays open and
 * expires like any other, because a gate that approves on weak evidence is worse
 * than no gate at all.
 */
export async function requestApproval(
  input: RequestApprovalInput,
): Promise<ApprovalRecord> {
  const id = newApprovalId()
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS))
  const confidence = input.confidence ?? null

  const selfApproved =
    input.channel === 'auto' &&
    confidence !== null &&
    confidence >= AUTO_APPROVAL_CONFIDENCE

  const status = selfApproved ? 'approved' : 'pending'

  await db.insert(approvalRequests).values({
    id,
    userId: input.userId,
    projectId: input.projectId,
    orchestrationId: input.orchestrationId ?? null,
    channel: input.channel,
    title: input.title,
    summary: input.summary ?? null,
    payload: input.payload ?? {},
    confidence,
    retries: 0,
    status,
    webhookUrl: input.webhookUrl ?? null,
    expiresAt,
    decidedBy: selfApproved ? 'auto-gate' : null,
    decidedAt: selfApproved ? new Date() : null,
  })

  const entry = await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: 'approval_requested',
    subjectKey: input.requestedBy,
    subjectTitle: input.title,
    signer: input.requestedBy,
    objectiveId: input.objectiveId ?? null,
    payloadRef: id,
    payload: {
      requestId: id,
      channel: input.channel,
      title: input.title,
      confidence,
      selfApproved,
      status,
      expiresAt: expiresAt.toISOString(),
      orchestrationId: input.orchestrationId ?? null,
    },
  })

  await db
    .update(approvalRequests)
    .set({ sentinelEntryId: entry.id })
    .where(eq(approvalRequests.id, id))

  return {
    id,
    status,
    channel: input.channel,
    selfApproved,
    expiresAt,
    sentinelEntryId: entry.id,
  }
}

export interface DecideApprovalInput {
  userId: string
  projectId: string
  requestId: string
  decision: 'approved' | 'rejected'
  note?: string | null
  decidedBy: string
}

export class ApprovalNotOpenError extends Error {
  constructor(
    readonly requestId: string,
    readonly status: string,
  ) {
    super(`Approval ${requestId} is not open for decision (status: ${status})`)
    this.name = 'ApprovalNotOpenError'
  }
}

/**
 * Records a decision on an open gate.
 *
 * Only a `pending` gate can be decided. A gate that already closed — approved,
 * rejected, or expired — is immutable, because rewriting a decision after the
 * fact is exactly how a refused result ends up described as approved. Retrying a
 * rejected result means opening a *new* gate, which leaves both in the ledger.
 */
export async function decideApproval(input: DecideApprovalInput) {
  const decision = approvalDecisionSchema.parse({
    requestId: input.requestId,
    decision: input.decision,
    note: input.note ?? undefined,
    decidedBy: input.decidedBy,
  })

  if (!APPROVAL_REQUEST_ID.test(decision.requestId)) {
    throw new Error(`Malformed approval id: ${decision.requestId}`)
  }

  const rows = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.id, decision.requestId),
        // Scoped to the caller's project: an id from another project must not be
        // decidable here even if it is guessed correctly.
        eq(approvalRequests.projectId, input.projectId),
        eq(approvalRequests.userId, input.userId),
      ),
    )
    .limit(1)

  const request = rows[0]
  if (!request) throw new Error(`Approval ${decision.requestId} not found`)
  if (request.status !== 'pending') {
    throw new ApprovalNotOpenError(request.id, request.status)
  }

  const now = new Date()

  await db
    .update(approvalRequests)
    .set({
      status: decision.decision,
      decision: decision.decision,
      decisionNote: decision.note ?? null,
      decidedBy: decision.decidedBy,
      decidedAt: now,
    })
    .where(eq(approvalRequests.id, request.id))

  const entry = await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: 'approval_decided',
    subjectKey: decision.decidedBy,
    subjectTitle: request.title,
    signer: decision.decidedBy,
    payloadRef: request.id,
    payload: {
      requestId: request.id,
      decision: decision.decision,
      note: decision.note ?? null,
      decidedBy: decision.decidedBy,
      channel: request.channel,
      requestedEntryId: request.sentinelEntryId,
    },
  })

  return { requestId: request.id, decision: decision.decision, entry }
}

/**
 * Consumes one retry against a rejected gate.
 *
 * The budget is what stops a refused result being resubmitted until someone
 * relents. At MAX_APPROVAL_RETRIES the gate closes as `rejected_max_retries`,
 * which is terminal — the only way forward after that is a new gate with new
 * evidence, and the exhausted one stays on record beside it.
 */
export async function recordApprovalRetry(input: {
  userId: string
  projectId: string
  requestId: string
}): Promise<{ retries: number; exhausted: boolean }> {
  const rows = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.id, input.requestId),
        eq(approvalRequests.projectId, input.projectId),
        eq(approvalRequests.userId, input.userId),
      ),
    )
    .limit(1)

  const request = rows[0]
  if (!request) throw new Error(`Approval ${input.requestId} not found`)

  const retries = request.retries + 1
  const exhausted = retries >= MAX_APPROVAL_RETRIES

  await db
    .update(approvalRequests)
    .set({
      retries,
      // Only a still-rejected gate can exhaust its budget. An approved one has
      // nothing left to retry.
      status:
        exhausted && request.status === 'rejected'
          ? 'rejected_max_retries'
          : request.status,
    })
    .where(eq(approvalRequests.id, request.id))

  return { retries, exhausted }
}

export interface ExpiredApproval {
  id: string
  projectId: string
  title: string
}

/**
 * Closes every gate that ran out of time.
 *
 * Expiry is a refusal, not an approval — that is the whole point of fail-closed.
 * Each closure is sealed so the ledger shows the gate was opened and never
 * answered, rather than simply vanishing. Run from the same nightly cron that
 * drives MORPHEUS; a gate left pending forever would otherwise look identical to
 * one still legitimately awaiting a human.
 */
export async function expireStaleApprovals(
  userId: string,
  projectId: string,
): Promise<ExpiredApproval[]> {
  const now = new Date()

  const stale = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.projectId, projectId),
        eq(approvalRequests.userId, userId),
        eq(approvalRequests.status, 'pending'),
        lt(approvalRequests.expiresAt, now),
      ),
    )

  const expired: ExpiredApproval[] = []

  for (const request of stale) {
    await db
      .update(approvalRequests)
      .set({ status: 'expired', decidedAt: now })
      .where(eq(approvalRequests.id, request.id))

    await appendSentinelEntry({
      userId,
      projectId,
      entryType: 'approval_decided',
      subjectKey: request.id,
      subjectTitle: request.title,
      signer: 'approval-gate',
      payloadRef: request.id,
      payload: {
        requestId: request.id,
        decision: 'expired',
        // Recorded explicitly: silence is a refusal, and the ledger should say so
        // in words rather than leaving a reader to infer it from a status.
        note: 'Gate expired without a decision. Treated as refused.',
        channel: request.channel,
        requestedEntryId: request.sentinelEntryId,
      },
    })

    expired.push({ id: request.id, projectId, title: request.title })
  }

  return expired
}

/** Open gates for a project — what a steward still owes a decision on. */
export async function pendingApprovals(projectId: string) {
  return db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.projectId, projectId),
        eq(approvalRequests.status, 'pending'),
      ),
    )
}
