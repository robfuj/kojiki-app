import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { kaizenExperiences, subAgentTasks } from '@/lib/db/schema'
import { appendSentinelEntry } from '@/lib/sentinel'

/**
 * KAIZEN — the PDCA loop driving stages 7 (OUTCOME) and 8 (LEARNING).
 *
 * The point of this layer is that reabsorption is evidence-based. A department
 * head does not fold a sub-agent's work into the OKR tree because the sub-agent
 * said it finished; it folds it in because Check compared actuals against the
 * criteria the head committed to during Plan, before the work started.
 *
 * The detail that shapes the whole design: the verdict has three states, not two.
 * `LEARNING` is a failure that produced a learning case worth carrying forward.
 * Upstream validators promote learning rather than merely rejecting, so a missed
 * target that taught the department something is a different outcome from a
 * missed target that taught it nothing — and only the first should still be
 * allowed to propose an OKR node.
 */

export type ComparisonOperator = 'gte' | 'lte' | 'gt' | 'lt' | 'eq'

/** One measurable commitment made during Plan. */
export interface SuccessCriterion {
  metric: string
  target: number
  operator: ComparisonOperator
  /** Relative importance, used to weight the outcome score. */
  weight: number
  unit?: string
}

/**
 * A hard constraint. Breaching a guardrail fails the attempt outright regardless
 * of how well the weighted criteria scored — a target hit by unacceptable means
 * is not a success.
 */
export interface Guardrail {
  metric: string
  limit: number
  operator: 'lte' | 'gte'
  note?: string
}

export type ValidationResult = 'PASS' | 'FAIL' | 'LEARNING'

export interface CriterionOutcome {
  metric: string
  target: number
  actual: number | null
  operator: ComparisonOperator
  weight: number
  met: boolean
  /** True when no actual was reported, so the criterion could not be judged. */
  unmeasured: boolean
}

export interface GuardrailBreach {
  metric: string
  limit: number
  actual: number
  note?: string
}

export interface CheckOutcome {
  result: ValidationResult
  /** Weighted attainment across criteria, 0-100. */
  score: number
  criteria: CriterionOutcome[]
  breaches: GuardrailBreach[]
  /** Populated for LEARNING: what the attempt taught the department. */
  learningCase: string | null
}

/** Weighted score below which an attempt cannot pass. */
const PASS_THRESHOLD = 80

function compare(actual: number, operator: ComparisonOperator, target: number) {
  switch (operator) {
    case 'gte':
      return actual >= target
    case 'lte':
      return actual <= target
    case 'gt':
      return actual > target
    case 'lt':
      return actual < target
    case 'eq':
      return actual === target
  }
}

/**
 * Check — compares Do's actuals against Plan's criteria and runs the guardrails.
 *
 * `learningCase` is what separates LEARNING from FAIL. Both are below threshold;
 * only LEARNING produced something reusable. Callers pass it when the attempt
 * yielded an insight, and the verdict follows from that rather than from a
 * separate judgement call.
 */
export function runCheck(input: {
  criteria: SuccessCriterion[]
  guardrails: Guardrail[]
  actuals: Record<string, number>
  learningCase?: string | null
}): CheckOutcome {
  const { criteria, guardrails, actuals } = input
  const learningCase = input.learningCase?.trim() || null

  const evaluated: CriterionOutcome[] = criteria.map((criterion) => {
    const actual = actuals[criterion.metric]
    const unmeasured = typeof actual !== 'number' || Number.isNaN(actual)
    return {
      metric: criterion.metric,
      target: criterion.target,
      actual: unmeasured ? null : actual,
      operator: criterion.operator,
      weight: criterion.weight,
      met: unmeasured ? false : compare(actual, criterion.operator, criterion.target),
      unmeasured,
    }
  })

  const breaches: GuardrailBreach[] = guardrails.flatMap((guardrail) => {
    const actual = actuals[guardrail.metric]
    if (typeof actual !== 'number' || Number.isNaN(actual)) return []
    const breached =
      guardrail.operator === 'lte' ? actual > guardrail.limit : actual < guardrail.limit
    return breached
      ? [{ metric: guardrail.metric, limit: guardrail.limit, actual, note: guardrail.note }]
      : []
  })

  const totalWeight = evaluated.reduce((sum, c) => sum + c.weight, 0)
  const earnedWeight = evaluated.reduce((sum, c) => sum + (c.met ? c.weight : 0), 0)
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  // A guardrail breach is a hard fail: the means disqualify the result, and no
  // amount of learning redeems it.
  if (breaches.length > 0) {
    return { result: 'FAIL', score, criteria: evaluated, breaches, learningCase: null }
  }

  if (score >= PASS_THRESHOLD) {
    return { result: 'PASS', score, criteria: evaluated, breaches, learningCase: null }
  }

  // Below threshold. The attempt still counts if it taught the department
  // something it can reuse — that is LEARNING, not FAIL.
  return {
    result: learningCase ? 'LEARNING' : 'FAIL',
    score,
    criteria: evaluated,
    breaches,
    learningCase,
  }
}

/** Renders a Check outcome as prose for prompts and the activity feed. */
export function describeCheck(outcome: CheckOutcome): string {
  const lines = outcome.criteria.map((criterion) => {
    const actual = criterion.unmeasured ? 'unmeasured' : String(criterion.actual)
    const mark = criterion.met ? 'met' : 'missed'
    return `- ${criterion.metric}: ${actual} vs ${criterion.operator} ${criterion.target} (${mark})`
  })

  const header = `Kaizen Check: ${outcome.result} (outcome score ${outcome.score}/100)`
  const breachLine =
    outcome.breaches.length > 0
      ? `\nGuardrail breaches:\n${outcome.breaches
          .map((b) => `- ${b.metric}: ${b.actual} beyond limit ${b.limit}`)
          .join('\n')}`
      : ''
  const learningLine = outcome.learningCase
    ? `\nLearning case: ${outcome.learningCase}`
    : ''

  return `${header}\n${lines.join('\n')}${breachLine}${learningLine}`
}

export interface PersistCheckInput {
  userId: string
  projectId: string
  taskId: string
  outcome: CheckOutcome
  /** The agent whose attempt this was, for attribution in the ledger. */
  agentKey: string
  agentTitle: string
  objectiveId: string
}

/**
 * Persists a Check verdict onto its task and seals it into SENTINEL.
 *
 * Sealing matters here specifically: the verdict is the evidence a later
 * reabsorption rests on, so it must not be restatable after the fact.
 */
export async function persistCheck(input: PersistCheckInput) {
  const { taskId, outcome, userId, projectId, agentKey, agentTitle, objectiveId } = input

  await db
    .update(subAgentTasks)
    .set({
      actuals: outcome.criteria.reduce<Record<string, number>>((acc, criterion) => {
        if (criterion.actual !== null) acc[criterion.metric] = criterion.actual
        return acc
      }, {}),
      validationResult: outcome.result,
      outcomeScore: outcome.score,
      guardrailBreaches: outcome.breaches,
      checkedAt: new Date(),
      status: outcome.result === 'PASS' ? 'verified' : 'checked',
      updatedAt: new Date(),
    })
    .where(eq(subAgentTasks.id, taskId))

  const entry = await appendSentinelEntry({
    userId,
    projectId,
    entryType: 'kaizen_checked',
    subjectKey: agentKey,
    subjectTitle: agentTitle,
    signer: 'kaizen',
    objectiveId,
    payloadRef: taskId,
    payload: {
      taskId,
      result: outcome.result,
      score: outcome.score,
      criteria: outcome.criteria,
      breaches: outcome.breaches,
      learningCase: outcome.learningCase,
    },
  })

  return { entry, outcome }
}

export interface RecordExperienceInput {
  userId: string
  projectId: string
  objectiveId?: string | null
  taskId?: string | null
  agentKey: string
  agentTitle: string
  hypothesis: string
  action: string
  expected: string
  observed: string
  errorClass: string
  escalationLayer: string
  redefinition?: string | null
  supersedes?: string | null
  reason?: string | null
  insight?: string | null
  reusable?: boolean
}

/**
 * Act — records the causal trace of one attempt.
 *
 * This is the corpus the Neuraxis governance gate counts as corroboration. An
 * agent cannot manufacture authority by asserting it has earned more; the gate
 * counts distinct sealed experiences, and each one is a hypothesis/action/
 * expected/observed trace written at the time the attempt happened.
 */
export async function recordExperience(input: RecordExperienceInput) {
  const id = crypto.randomUUID()

  const entry = await appendSentinelEntry({
    userId: input.userId,
    projectId: input.projectId,
    entryType: 'experience_recorded',
    subjectKey: input.agentKey,
    subjectTitle: input.agentTitle,
    signer: 'kaizen',
    objectiveId: input.objectiveId ?? null,
    payloadRef: id,
    payload: {
      experienceId: id,
      taskId: input.taskId ?? null,
      hypothesis: input.hypothesis,
      action: input.action,
      expected: input.expected,
      observed: input.observed,
      errorClass: input.errorClass,
      escalationLayer: input.escalationLayer,
      redefinition: input.redefinition ?? null,
      insight: input.insight ?? null,
      reusable: input.reusable ?? false,
    },
  })

  await db.insert(kaizenExperiences).values({
    id,
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
    escalationLayer: input.escalationLayer,
    redefinition: input.redefinition ?? null,
    supersedes: input.supersedes ?? null,
    reason: input.reason ?? null,
    insight: input.insight ?? null,
    reusable: input.reusable ?? false,
    sentinelEntryId: entry.id,
  })

  return { id, entry }
}

/** Distinct sealed experiences for an agent — the gate's corroboration count. */
export async function countCorroboratingExperiences(
  projectId: string,
  agentKey: string,
  errorClass: string,
): Promise<number> {
  const matching = await db
    .select({ id: kaizenExperiences.id })
    .from(kaizenExperiences)
    .where(
      and(
        eq(kaizenExperiences.projectId, projectId),
        eq(kaizenExperiences.agentKey, agentKey),
        eq(kaizenExperiences.errorClass, errorClass),
      ),
    )

  return new Set(matching.map((row) => row.id)).size
}
