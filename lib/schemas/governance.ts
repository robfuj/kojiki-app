import { z } from 'zod'

/**
 * Validation contracts for the governance engines.
 *
 * These mirror the upstream kojiki-ontology schemas, with one systematic
 * difference: every identifier is validated here rather than trusted from a
 * model's output. An agent that invents a malformed problem id or claims a right
 * it was never granted fails at the boundary instead of poisoning the ledger.
 */

// ---------------------------------------------------------------------------
// SACCADE framing
// ---------------------------------------------------------------------------

/** P- followed by exactly ten digits, per upstream's problem id format. */
export const SACCADE_PROBLEM_ID = /^P-\d{10}$/

export const KAIZEN_CLASSES = {
  L0: 'Execution Error',
  L1: 'Schema Violation',
  L2: 'Logic Error',
  L3: 'Governance Gap',
  L4: 'Data Integrity',
  L5: 'Resource Exhaustion',
  L6: 'External Dependency',
  L7: 'Configuration Drift',
  L8: 'Identity Mismatch',
  L9: 'Consultation Deadlock',
  L10: 'Approval Rejection',
  L11: 'Orientation Failure',
  L12: 'SACCADE Framing Error',
  L13: 'OKR Validation Error',
} as const

export type KaizenClass = keyof typeof KAIZEN_CLASSES

export const kaizenClassSchema = z.enum(
  Object.keys(KAIZEN_CLASSES) as [KaizenClass, ...KaizenClass[]],
)

/**
 * Classes that mean the system itself is wrong rather than the run being
 * unlucky. These escalate to NEURAXIS instead of simply retrying.
 */
export const ESCALATING_KAIZEN_CLASSES: readonly KaizenClass[] = [
  'L3',
  'L4',
  'L8',
  'L9',
  'L12',
  'L13',
]

export function kaizenClassEscalates(errorClass: KaizenClass): boolean {
  return ESCALATING_KAIZEN_CLASSES.includes(errorClass)
}

export const saccadeProblemSchema = z.object({
  problemId: z.string().regex(SACCADE_PROBLEM_ID, 'problemId must be P-XXXXXXXXXX'),
  title: z.string().min(3).max(200),
  description: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string()).default([]),
  kaizenClassification: kaizenClassSchema,
  departments: z.array(z.string().min(1)).min(1),
  // Registry node, e.g. "Marketing.Head".
  owner: z.string().min(1),
})

export type SaccadeProblem = z.infer<typeof saccadeProblemSchema>

/**
 * Models routinely emit a near-miss id — a short digit run, a lowercase prefix,
 * a stray separator. Upstream regenerates on failure; normalising first is
 * cheaper and keeps the model's own framing intact.
 */
export function normaliseProblemId(candidate: string): string | null {
  const digits = candidate.replace(/\D/g, '')
  if (digits.length === 0) return null
  return `P-${digits.padStart(10, '0').slice(-10)}`
}

/** Parses a framing, repairing a recoverable id rather than rejecting outright. */
export function parseSaccadeProblem(
  input: unknown,
): { ok: true; problem: SaccadeProblem; repaired: boolean } | { ok: false; error: string } {
  const direct = saccadeProblemSchema.safeParse(input)
  if (direct.success) return { ok: true, problem: direct.data, repaired: false }

  const raw = input as { problemId?: unknown } | null
  if (!raw || typeof raw.problemId !== 'string') {
    return { ok: false, error: direct.error.issues[0]?.message ?? 'invalid framing' }
  }

  const repaired = normaliseProblemId(raw.problemId)
  if (!repaired) {
    return { ok: false, error: direct.error.issues[0]?.message ?? 'invalid framing' }
  }

  const retry = saccadeProblemSchema.safeParse({ ...raw, problemId: repaired })
  if (retry.success) return { ok: true, problem: retry.data, repaired: true }
  return { ok: false, error: retry.error.issues[0]?.message ?? 'invalid framing' }
}

// ---------------------------------------------------------------------------
// Decision rights
// ---------------------------------------------------------------------------

export const DECISION_RIGHT_TYPES = [
  'own',
  'recommend',
  'consult',
  'approve',
  'execute',
  'escalate',
  'automate',
] as const

export type DecisionRightType = (typeof DECISION_RIGHT_TYPES)[number]

/**
 * Each right maps to the action patterns it covers. A pattern is either an exact
 * action or a `prefix:*` wildcard, so "dispatch:*" grants every dispatch without
 * enumerating them.
 */
export const decisionRightsSchema = z.object({
  own: z.array(z.string()).default([]),
  recommend: z.array(z.string()).default([]),
  consult: z.array(z.string()).default([]),
  approve: z.array(z.string()).default([]),
  execute: z.array(z.string()).default([]),
  escalate: z.array(z.string()).default([]),
  automate: z.array(z.string()).default([]),
})

export type DecisionRights = z.infer<typeof decisionRightsSchema>

export const decisionRightsGrantSchema = z.object({
  projectId: z.string().min(1),
  agentKey: z.string().min(1),
  rights: decisionRightsSchema,
  source: z.enum(['default', 'gate', 'manual']).default('manual'),
  grantedBy: z.string().optional(),
  gateRequestId: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Approval gates
// ---------------------------------------------------------------------------

export const APPROVAL_REQUEST_ID = /^APPR-\d{10}$/

/**
 * Upstream also offers a 'cli' channel. There is no terminal on Vercel to answer
 * it, so a request that chose it would hang until expiry — it is not offered.
 */
export const approvalChannelSchema = z.enum(['webhook', 'auto', 'failclosed'])

export type ApprovalChannel = z.infer<typeof approvalChannelSchema>

export const approvalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'rejected_max_retries',
  'expired',
])

export const approvalRequestSchema = z.object({
  requestId: z.string().regex(APPROVAL_REQUEST_ID, 'requestId must be APPR-XXXXXXXXXX'),
  projectId: z.string().min(1),
  orchestrationId: z.string().optional(),
  channel: approvalChannelSchema,
  title: z.string().min(3).max(200),
  summary: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1).optional(),
  retries: z.number().int().min(0).max(3).default(0),
  status: approvalStatusSchema.default('pending'),
  webhookUrl: z.url().optional(),
  expiresAt: z.coerce.date(),
})

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>

/** Above this confidence an 'auto' channel gate approves itself. */
export const AUTO_APPROVAL_CONFIDENCE = 0.8

export const MAX_APPROVAL_RETRIES = 3

export const approvalDecisionSchema = z.object({
  requestId: z.string().regex(APPROVAL_REQUEST_ID),
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(2000).optional(),
  decidedBy: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Handoffs
// ---------------------------------------------------------------------------

export const HANDOFF_REQUEST_ID = /^HAND-\d{10}$/

export const handoffStatusSchema = z.enum([
  'sent',
  'received',
  'processing',
  'completed',
  'closed',
  'rejected',
])

/**
 * Handoff payload contracts, keyed the way the ontology names them. A sender
 * that cannot satisfy its own schema is rejected before the receiver ever sees
 * the request — a malformed handoff costs a round trip otherwise.
 */
export const handoffPayloadSchemas = {
  'handoff-lead': z.object({
    leadId: z.string().min(1),
    source: z.string().min(1),
    score: z.number().min(0).max(1).optional(),
    notes: z.string().optional(),
  }),
  'handoff-landing-page': z.object({
    pageKey: z.string().min(1),
    copy: z.string().min(1),
    cta: z.string().min(1),
    audience: z.string().optional(),
  }),
  'handoff-content': z.object({
    briefId: z.string().min(1),
    topic: z.string().min(1),
    keywords: z.array(z.string()).default([]),
    outline: z.string().optional(),
  }),
  'handoff-review': z.object({
    artifactId: z.string().min(1),
    artifactType: z.string().min(1),
    checklist: z.array(z.string()).default([]),
  }),
  'handoff-escalation': z.object({
    reason: z.string().min(1),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    evidence: z.array(z.string()).default([]),
  }),
} as const

export type HandoffSchemaKey = keyof typeof handoffPayloadSchemas

export const handoffSchemaKeySchema = z.enum(
  Object.keys(handoffPayloadSchemas) as [HandoffSchemaKey, ...HandoffSchemaKey[]],
)

export const handoffRequestSchema = z.object({
  handoffId: z.string().regex(HANDOFF_REQUEST_ID, 'handoffId must be HAND-XXXXXXXXXX'),
  projectId: z.string().min(1),
  sourceAgent: z.string().min(1),
  targetAgent: z.string().min(1),
  trigger: z.string().min(1),
  schemaKey: handoffSchemaKeySchema,
  payload: z.record(z.string(), z.unknown()),
  status: handoffStatusSchema.default('sent'),
})

export type HandoffRequest = z.infer<typeof handoffRequestSchema>

/** Validates a payload against the contract for its handoff type. */
export function validateHandoffPayload(
  schemaKey: HandoffSchemaKey,
  payload: unknown,
): { ok: true; payload: unknown } | { ok: false; error: string } {
  const schema = handoffPayloadSchemas[schemaKey] as z.ZodType
  const result = schema.safeParse(payload)
  if (result.success) return { ok: true, payload: result.data }
  return {
    ok: false,
    error: result.error.issues
      .map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`)
      .join('; '),
  }
}

// ---------------------------------------------------------------------------
// Kaizen learning cases
// ---------------------------------------------------------------------------

export const kaizenLearningCaseSchema = z.object({
  projectId: z.string().min(1).optional(),
  errorClass: kaizenClassSchema,
  problemId: z.string().optional(),
  taskId: z.string().optional(),
  symptom: z.string().min(1),
  rootCause: z.string().optional(),
  resolution: z.string().optional(),
  reusableInsight: z.string().optional(),
  verdict: z.enum(['PASS', 'FAIL', 'LEARNING']).default('LEARNING'),
})

export type KaizenLearningCase = z.infer<typeof kaizenLearningCaseSchema>

// ---------------------------------------------------------------------------
// Sub-agent configuration
// ---------------------------------------------------------------------------

export const subAgentConfigSchema = z.object({
  name: z.string().min(1),
  department: z.string().min(1),
  model: z
    .object({
      primary: z.string().min(1),
      fallback: z.string().optional(),
      reasoning: z.string().optional(),
    })
    .optional(),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  githubDiscovery: z
    .object({
      keywords: z.array(z.string()).default([]),
      autoInstall: z.boolean().default(false),
    })
    .optional(),
  handoffs: z
    .array(
      z.object({
        target: z.string().min(1),
        trigger: z.string().min(1),
        schemaKey: handoffSchemaKeySchema.optional(),
      }),
    )
    .default([]),
})

export type SubAgentConfig = z.infer<typeof subAgentConfigSchema>
