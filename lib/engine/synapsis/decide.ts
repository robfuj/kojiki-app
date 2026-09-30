import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { synapsisInterpretations, synapsisOutputs, synapsisStrategies } from '@/lib/db/schema'
import { stageId, StageContext, requireStage, sealStage } from './core'
import { interpret } from './frame'

export interface StrategiseInput extends StageContext {
  interpretationRef: string
  objective: string
  rationale: string
  timeline?: string
  successCriteria?: string[]
  escalationConditions?: string[]
  decisionRights?: Record<string, unknown>
}

/**
 * Commits to a strategy.
 *
 * Success criteria and escalation conditions are fixed here, before any output
 * exists. That is what makes the outcome stage a comparison rather than a
 * judgement call — and it is the same property the sub-goal dispatch relies on.
 */
export async function strategise(input: StrategiseInput) {
  await requireStage('strategise', 'interpret', input.problemId, async () => {
    const rows = await db
      .select({ interpretationId: synapsisInterpretations.interpretationId })
      .from(synapsisInterpretations)
      .where(
        and(
          eq(synapsisInterpretations.interpretationId, input.interpretationRef),
          eq(synapsisInterpretations.problemId, input.problemId),
          eq(synapsisInterpretations.userId, input.userId),
        ),
      )
      .limit(1)
    return rows.length > 0
  })

  const strategyId = stageId('STRA')

  await db.insert(synapsisStrategies).values({
    strategyId,
    userId: input.userId,
    problemId: input.problemId,
    interpretationRef: input.interpretationRef,
    objective: input.objective,
    rationale: input.rationale,
    timeline: input.timeline ?? null,
    successCriteria: input.successCriteria ?? [],
    escalationConditions: input.escalationConditions ?? [],
    decisionRights: input.decisionRights ?? {},
  })

  const entry = await sealStage('strategise', input, input.objective, strategyId, {
    strategyId,
    interpretationRef: input.interpretationRef,
    successCriteria: input.successCriteria ?? [],
    escalationConditions: input.escalationConditions ?? [],
  })

  return { strategyId, sentinelEntryId: entry.id }
}

// ---------------------------------------------------------------------------
// Stage 5 — output
// ---------------------------------------------------------------------------

export interface OutputInput extends StageContext {
  strategyId: string
  content: Record<string, unknown>
  /** When the result will be measurable — an output with no window cannot be scored. */
  measurementWindow?: Record<string, unknown>
  confidence?: 'high' | 'medium' | 'low'
}

/** Produces the deliverable a strategy committed to. */
export async function produceOutput(input: OutputInput) {
  await requireStage('output', 'strategise', input.problemId, async () => {
    const rows = await db
      .select({ strategyId: synapsisStrategies.strategyId })
      .from(synapsisStrategies)
      .where(
        and(
          eq(synapsisStrategies.strategyId, input.strategyId),
          eq(synapsisStrategies.problemId, input.problemId),
          eq(synapsisStrategies.userId, input.userId),
        ),
      )
      .limit(1)
    return rows.length > 0
  })

  const outputId = stageId('OUTP')

  await db.insert(synapsisOutputs).values({
    outputId,
    userId: input.userId,
    projectId: input.projectId,
    strategyId: input.strategyId,
    content: input.content,
    measurementWindow: input.measurementWindow ?? {},
    confidence: input.confidence ?? null,
  })

  const entry = await sealStage('output', input, input.strategyId, outputId, {
    outputId,
    strategyId: input.strategyId,
    measurementWindow: input.measurementWindow ?? {},
    confidence: input.confidence ?? null,
  })

  return { outputId, sentinelEntryId: entry.id }
}

// ---------------------------------------------------------------------------
// Stage 6 — outcome
// ---------------------------------------------------------------------------
