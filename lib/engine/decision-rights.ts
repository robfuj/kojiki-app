import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentDecisionRights } from '@/lib/db/schema'
import {
  DECISION_RIGHT_TYPES,
  decisionRightsSchema,
  type DecisionRightType,
  type DecisionRights,
} from '@/lib/schemas/governance'
import { appendSentinelEntry } from '@/lib/sentinel'

/**
 * DECISION RIGHTS GATE — what an agent may do, as opposed to what it can do.
 *
 * Without this, Mycelium is a message bus: any node can dispatch work to any
 * other node, approve its own output, and act on a result nobody authorised. The
 * gate makes propagation a governed act by separating seven rights:
 *
 *   own       — the actions this agent is accountable for
 *   recommend — proposing an action for someone else to take
 *   consult   — asking another node, and being asked
 *   approve   — authorising a result
 *   execute   — dispatching or carrying out work
 *   escalate  — raising to NEURAXIS
 *   automate  — acting without a human in the loop
 *
 * The two that matter most are closed by default. `approve` and `automate` are
 * never in the baseline: an agent cannot authorise its own output or act without
 * a human unless a gate decision explicitly widened its rights, and that widening
 * is itself recorded with the gate that granted it. Everything else is permissive
 * by default so ordinary coordination keeps working — the gate constrains
 * self-authorisation, not conversation.
 *
 * A denial is sealed into SENTINEL rather than dropped. An agent refused
 * authority leaves a record of having asked, which is how a pattern of an agent
 * reaching for rights it does not have becomes visible.
 */

export function emptyRights(): DecisionRights {
  return {
    own: [],
    recommend: [],
    consult: [],
    approve: [],
    execute: [],
    escalate: [],
    automate: [],
  }
}

/**
 * The baseline every registered agent gets before any grant exists.
 *
 * Deliberately permissive for coordination and closed for self-authorisation:
 * an agent may own its own domain, recommend, consult, execute dispatches and
 * reports, and escalate. It may not approve or automate.
 */
export function defaultRightsFor(agentKey: string): DecisionRights {
  return {
    own: [`${agentKey}:*`],
    recommend: ['*'],
    consult: ['*'],
    approve: [],
    execute: ['dispatch:*', 'report:*', 'reabsorb:*'],
    escalate: ['*'],
    automate: [],
  }
}

/**
 * Whether a granted pattern covers an action.
 *
 * Patterns are exact ("dispatch:marketing-brand/seo-specialist") or a prefix
 * wildcard ("dispatch:*"). A bare "*" covers everything, which is why it only
 * ever appears in a grant that a gate approved.
 */
export function matchesAction(patterns: string[], action: string): boolean {
  for (const pattern of patterns) {
    if (pattern === '*') return true
    if (pattern === action) return true
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -1)
      if (action.startsWith(prefix)) return true
    }
  }
  return false
}

export interface RightsRecord {
  rights: DecisionRights
  /** 'stored' when a grant exists, 'default' when the baseline applied. */
  source: 'stored' | 'default'
  grantedBy: string | null
  gateRequestId: string | null
}

/**
 * Propagation checks a right on every signal, and almost every agent has no
 * stored grant — so the common case is a database round trip to learn that
 * nothing has been granted. That is too much I/O for a hot path.
 *
 * Only the *absence* of a grant is cached, which makes the staleness one-sided
 * in the safe direction: a cached miss can delay a newly granted right by up to
 * ABSENT_GRANT_TTL_MS before it takes effect, but a stored grant is never cached,
 * so narrowing or revoking a right is always read fresh. A cache that could
 * prolong a revoked right would defeat the gate; this one cannot.
 */
const ABSENT_GRANT_TTL_MS = 30_000
const absentGrants = new Map<string, number>()

function absentKey(projectId: string, agentKey: string): string {
  return `${projectId}\u0000${agentKey}`
}

/** The rights in force for one agent in one project. */
export async function getDecisionRights(
  projectId: string,
  agentKey: string,
): Promise<RightsRecord> {
  const cacheKey = absentKey(projectId, agentKey)
  const cachedAt = absentGrants.get(cacheKey)
  if (cachedAt !== undefined) {
    if (Date.now() - cachedAt < ABSENT_GRANT_TTL_MS) {
      return {
        rights: defaultRightsFor(agentKey),
        source: 'default',
        grantedBy: null,
        gateRequestId: null,
      }
    }
    absentGrants.delete(cacheKey)
  }

  const rows = await db
    .select()
    .from(agentDecisionRights)
    .where(
      and(
        eq(agentDecisionRights.projectId, projectId),
        eq(agentDecisionRights.agentKey, agentKey),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row) {
    absentGrants.set(cacheKey, Date.now())
    return {
      rights: defaultRightsFor(agentKey),
      source: 'default',
      grantedBy: null,
      gateRequestId: null,
    }
  }

  // A malformed stored grant falls back to the baseline rather than to nothing:
  // a corrupted row should not silently strip an agent of its ordinary rights,
  // and it should not widen them either.
  const parsed = decisionRightsSchema.safeParse(row.rights)
  return {
    rights: parsed.success ? parsed.data : defaultRightsFor(agentKey),
    source: 'stored',
    grantedBy: row.grantedBy,
    gateRequestId: row.gateRequestId,
  }
}

export interface GrantInput {
  userId: string
  projectId: string
  agentKey: string
  rights: DecisionRights
  source?: 'gate' | 'manual'
  grantedBy?: string | null
  gateRequestId?: string | null
}

/**
 * Sets the rights for one agent. Upsert on (projectId, agentKey) so a second
 * grant replaces the first rather than accumulating two conflicting rows.
 */
export async function grantDecisionRights(
  input: GrantInput,
): Promise<DecisionRights> {
  const rights = decisionRightsSchema.parse(input.rights)
  const id = crypto.randomUUID()

  // Drop any cached miss so the grant takes effect immediately on this instance
  // rather than waiting out the TTL.
  absentGrants.delete(absentKey(input.projectId, input.agentKey))

  await db
    .insert(agentDecisionRights)
    .values({
      id,
      userId: input.userId,
      projectId: input.projectId,
      agentKey: input.agentKey,
      rights,
      source: input.source ?? 'manual',
      grantedBy: input.grantedBy ?? null,
      gateRequestId: input.gateRequestId ?? null,
    })
    .onConflictDoUpdate({
      target: [agentDecisionRights.projectId, agentDecisionRights.agentKey],
      set: {
        rights,
        source: input.source ?? 'manual',
        grantedBy: input.grantedBy ?? null,
        gateRequestId: input.gateRequestId ?? null,
        updatedAt: new Date(),
      },
    })

  return rights
}

export interface RightCheck {
  allowed: boolean
  right: DecisionRightType
  action: string
  agentKey: string
  source: 'stored' | 'default'
  reason: string
}

/**
 * Whether `requesterKey` holds `rightType` over `action`.
 *
 * Reads only — no write, no seal. Callers that intend to act on a denial use
 * `assertRight`, which records it.
 */
export async function checkRight(
  projectId: string,
  requesterKey: string,
  action: string,
  rightType: DecisionRightType,
): Promise<RightCheck> {
  const record = await getDecisionRights(projectId, requesterKey)
  const patterns = record.rights[rightType] ?? []
  const allowed = matchesAction(patterns, action)

  return {
    allowed,
    right: rightType,
    action,
    agentKey: requesterKey,
    source: record.source,
    reason: allowed
      ? `${rightType} granted over "${action}" by ${record.source} rights`
      : `${rightType} not granted over "${action}" — ${
          patterns.length === 0
            ? `no ${rightType} patterns in force`
            : `held patterns do not cover it (${patterns.join(', ')})`
        }`,
  }
}

export class DecisionRightDeniedError extends Error {
  readonly check: RightCheck

  constructor(check: RightCheck) {
    super(
      `${check.agentKey} was denied ${check.right} over "${check.action}": ${check.reason}`,
    )
    this.name = 'DecisionRightDeniedError'
    this.check = check
  }
}

/**
 * Checks a right and seals the denial into SENTINEL before throwing.
 *
 * The seal is what makes the gate more than a runtime guard: an agent that
 * repeatedly reaches for authority it does not have produces a chain of
 * `right_denied` entries, and that pattern is evidence a gate can act on.
 */
export async function assertRight(input: {
  userId: string
  projectId: string
  requesterKey: string
  requesterTitle?: string
  action: string
  rightType: DecisionRightType
  objectiveId?: string | null
}): Promise<RightCheck> {
  const check = await checkRight(
    input.projectId,
    input.requesterKey,
    input.action,
    input.rightType,
  )

  if (check.allowed) return check

  await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: 'right_denied',
    subjectKey: input.requesterKey,
    subjectTitle: input.requesterTitle ?? input.requesterKey,
    signer: input.requesterKey,
    payload: {
      right: check.right,
      action: check.action,
      source: check.source,
      reason: check.reason,
    },
    payloadRef: `${input.requesterKey}:${check.right}:${check.action}`,
    objectiveId: input.objectiveId ?? null,
  })

  throw new DecisionRightDeniedError(check)
}

/** Every right an agent holds, for display in the governance surface. */
export async function describeRights(
  projectId: string,
  agentKey: string,
): Promise<{ right: DecisionRightType; patterns: string[] }[]> {
  const record = await getDecisionRights(projectId, agentKey)
  return DECISION_RIGHT_TYPES.map((right) => ({
    right,
    patterns: record.rights[right] ?? [],
  }))
}
