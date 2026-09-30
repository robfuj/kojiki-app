import { SynapsisOrderError } from './core'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { synapsisLearning, synapsisOutcomes, synapsisOutputs } from '@/lib/db/schema'
import { stageId, StageContext, requireStage, sealStage } from './core'

export interface OutcomeInput extends StageContext {
  outputId: string
  actuals: Record<string, number>
  evaluations?: Record<string, unknown>
  outcomeScore: 'met' | 'partial' | 'missed'
  targetMet: boolean
  /**
   * Whether the loop has settled. A false value is what triggers a redefinition
   * at the learning stage — the signal that another iteration is needed rather
   * than the same one repeated.
   */
  converged: boolean
  iterationCount?: number
  guardrailViolations?: string[]
  deviationAnalysis?: string
  confidence?: 'high' | 'medium' | 'low'
  kaizenIteration?: number
}

/**
 * Scores the output against the criteria the strategy fixed in advance.
 *
 * `targetMet` and `converged` are separate on purpose. A target can be met
 * without the loop converging (the result is right but the approach is unstable),
 * and the loop can converge on a missed target (the approach is sound and the
 * goal was wrong). Collapsing them would hide exactly the cases worth acting on.
 */
export async function recordOutcome(input: OutcomeInput) {
  await requireStage('outcome', 'output', input.problemId, async () => {
    const rows = await db
      .select({ outputId: synapsisOutputs.outputId })
      .from(synapsisOutputs)
      .where(
        and(
          eq(synapsisOutputs.outputId, input.outputId),
          eq(synapsisOutputs.userId, input.userId),
        ),
      )
      .limit(1)
    return rows.length > 0
  })

  const outcomeId = stageId('OUTC')

  await db.insert(synapsisOutcomes).values({
    outcomeId,
    userId: input.userId,
    outputId: input.outputId,
    actuals: input.actuals,
    evaluations: input.evaluations ?? {},
    outcomeScore: input.outcomeScore,
    targetMet: input.targetMet,
    converged: input.converged,
    iterationCount: input.iterationCount ?? 1,
    guardrailViolations: input.guardrailViolations ?? [],
    deviationAnalysis: input.deviationAnalysis ?? null,
    confidence: input.confidence ?? null,
    kaizenIteration: input.kaizenIteration ?? null,
  })

  const entry = await sealStage('outcome', input, input.outcomeScore, outcomeId, {
    outcomeId,
    outputId: input.outputId,
    outcomeScore: input.outcomeScore,
    targetMet: input.targetMet,
    converged: input.converged,
    iterationCount: input.iterationCount ?? 1,
    guardrailViolations: input.guardrailViolations ?? [],
  })

  return { outcomeId, sentinelEntryId: entry.id }
}

// ---------------------------------------------------------------------------
// Stage 7 — learn
// ---------------------------------------------------------------------------

export interface LearnInput extends StageContext {
  outcomeId: string
  experiences?: unknown[]
  patterns?: unknown[]
  reusableInsights?: string[]
  /**
   * How the problem should be re-framed next time. Present when the outcome did
   * not converge; this is the bridge from one iteration to the next.
   */
  redefinitions?: Record<string, unknown>
  outcomeScore?: 'met' | 'partial' | 'missed'
  guardrailViolations?: string[]
  confidence?: 'high' | 'medium' | 'low'
  kaizenIteration?: number
}

/**
 * Closes the loop.
 *
 * A non-converged outcome without a redefinition is refused. The loop either
 * settles or it says what to change — an iteration that ends with "it didn't
 * work" and nothing else produces a repeat rather than a next attempt, and the
 * record should not pretend otherwise.
 */
export async function integrateLearning(input: LearnInput) {
  const outcome = await db
    .select()
    .from(synapsisOutcomes)
    .where(
      and(
        eq(synapsisOutcomes.outcomeId, input.outcomeId),
        eq(synapsisOutcomes.userId, input.userId),
      ),
    )
    .limit(1)

  if (outcome.length === 0) {
    throw new SynapsisOrderError('learn', 'outcome', input.problemId)
  }

  const record = outcome[0]
  const redefinitions = input.redefinitions ?? {}

  if (!record.converged && Object.keys(redefinitions).length === 0) {
    throw new Error(
      `Outcome ${input.outcomeId} did not converge, so the learning stage must carry a redefinition. ` +
        `Without one the next iteration would repeat this attempt rather than change it.`,
    )
  }

  const learningId = stageId('LRN')

  await db.insert(synapsisLearning).values({
    learningId,
    userId: input.userId,
    projectId: input.projectId,
    experiences: input.experiences ?? [],
    patterns: input.patterns ?? [],
    reusableInsights: input.reusableInsights ?? [],
    redefinitions,
    outcomeScore: input.outcomeScore ?? record.outcomeScore,
    guardrailViolations: input.guardrailViolations ?? [],
    confidence: input.confidence ?? record.confidence,
    kaizenIteration: input.kaizenIteration ?? record.kaizenIteration,
  })

  const entry = await sealStage('learn', input, input.problemId, learningId, {
    learningId,
    outcomeId: input.outcomeId,
    converged: record.converged,
    reusableInsights: input.reusableInsights ?? [],
    redefinitions,
  })

  return { learningId, converged: record.converged, sentinelEntryId: entry.id }
}

// ---------------------------------------------------------------------------
// Reading the loop
// ---------------------------------------------------------------------------
