import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { synapsisEvidence, synapsisInterpretations, synapsisLearning, synapsisOutcomes, synapsisOutputs, synapsisProblems, synapsisStrategies } from '@/lib/db/schema'
import { STAGES, SynapsisStage } from './core'
import { interpret } from './frame'
import { strategise } from './decide'

export interface SynapsisStatus {
  problemId: string
  /** The furthest stage that has produced a row. */
  stage: SynapsisStage | 'none'
  /** Which stage may run next, or null once the loop has closed. */
  next: SynapsisStage | null
  counts: Record<SynapsisStage, number>
  converged: boolean | null
  goal: string | null
}

/**
 * Where a problem is in the loop.
 *
 * Counts every stage rather than inferring progress from the last row written,
 * so a problem with three findings and no interpretation reads as "evidence,
 * next interpret" rather than looking further along than it is.
 */
export async function synapsisStatus(
  userId: string,
  problemId: string,
): Promise<SynapsisStatus> {
  const [problem] = await db
    .select()
    .from(synapsisProblems)
    .where(
      and(
        eq(synapsisProblems.problemId, problemId),
        eq(synapsisProblems.userId, userId),
      ),
    )
    .limit(1)

  if (!problem) throw new Error(`Problem ${problemId} not found`)

  // Each table is scoped by its own columns. A shared helper that reached for
  // synapsisProblems.userId while selecting from another table would have
  // filtered on the wrong relation entirely.
  const [evidence, interpretations, strategies] = await Promise.all([
    db
      .select({ id: synapsisEvidence.findingId })
      .from(synapsisEvidence)
      .where(and(eq(synapsisEvidence.problemId, problemId), eq(synapsisEvidence.userId, userId))),
    db
      .select({ id: synapsisInterpretations.interpretationId })
      .from(synapsisInterpretations)
      .where(
        and(
          eq(synapsisInterpretations.problemId, problemId),
          eq(synapsisInterpretations.userId, userId),
        ),
      ),
    db
      .select({ id: synapsisStrategies.strategyId })
      .from(synapsisStrategies)
      .where(
        and(eq(synapsisStrategies.problemId, problemId), eq(synapsisStrategies.userId, userId)),
      ),
  ])

  // Learning is keyed by project, not by problem, and the column is nullable —
  // so a problem framed without one has no learning rows to count rather than
  // matching every null-project row in the table.
  const learning = problem.projectId
    ? await db
        .select({ id: synapsisLearning.learningId })
        .from(synapsisLearning)
        .where(
          and(
            eq(synapsisLearning.projectId, problem.projectId),
            eq(synapsisLearning.userId, userId),
          ),
        )
    : []

  // Outputs hang off a strategy and outcomes off an output, so neither carries a
  // problemId. They are reached through the ids already in hand — matched on the
  // right column, which is strategyId for outputs and outputId for outcomes.
  const strategyIds = strategies.map((row) => row.id)
  const outputs =
    strategyIds.length === 0
      ? []
      : await db
          .select({ id: synapsisOutputs.outputId })
          .from(synapsisOutputs)
          .where(
            and(
              eq(synapsisOutputs.userId, userId),
              inArray(synapsisOutputs.strategyId, strategyIds),
            ),
          )

  const outputIds = outputs.map((row) => row.id)
  const outcomes =
    outputIds.length === 0
      ? []
      : await db
          .select()
          .from(synapsisOutcomes)
          .where(
            and(eq(synapsisOutcomes.userId, userId), inArray(synapsisOutcomes.outputId, outputIds)),
          )

  const counts: Record<SynapsisStage, number> = {
    frame: 1,
    evidence: evidence.length,
    interpret: interpretations.length,
    strategise: strategies.length,
    output: outputs.length,
    outcome: outcomes.length,
    learn: learning.length,
  }

  // The furthest stage with a row. Scanning from the end means a loop that
  // reached learning reports 'learn' even if an earlier stage has many rows.
  let stage: SynapsisStage | 'none' = 'none'
  for (const candidate of STAGES) {
    if (counts[candidate] > 0) stage = candidate
  }

  const index = stage === 'none' ? -1 : STAGES.indexOf(stage)
  const next = index >= 0 && index < STAGES.length - 1 ? STAGES[index + 1] : null

  const latest = outcomes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

  return {
    problemId,
    stage,
    next,
    counts,
    converged: latest ? latest.converged : null,
    goal: problem.goal,
  }
}

/** A problem's full chain, stage by stage, newest first within each stage. */
export async function synapsisChain(userId: string, problemId: string) {
  const [problem, evidence, interpretations, strategies] = await Promise.all([
    db
      .select()
      .from(synapsisProblems)
      .where(and(eq(synapsisProblems.problemId, problemId), eq(synapsisProblems.userId, userId)))
      .limit(1),
    db
      .select()
      .from(synapsisEvidence)
      .where(and(eq(synapsisEvidence.problemId, problemId), eq(synapsisEvidence.userId, userId)))
      .orderBy(desc(synapsisEvidence.createdAt)),
    db
      .select()
      .from(synapsisInterpretations)
      .where(
        and(
          eq(synapsisInterpretations.problemId, problemId),
          eq(synapsisInterpretations.userId, userId),
        ),
      )
      .orderBy(desc(synapsisInterpretations.createdAt)),
    db
      .select()
      .from(synapsisStrategies)
      .where(
        and(eq(synapsisStrategies.problemId, problemId), eq(synapsisStrategies.userId, userId)),
      )
      .orderBy(desc(synapsisStrategies.createdAt)),
  ])

  // Learning carries a projectId rather than a problemId, so it is scoped through
  // the problem's own project once the problem is in hand.
  const learning = problem[0]?.projectId
    ? await db
        .select()
        .from(synapsisLearning)
        .where(
          and(
            eq(synapsisLearning.projectId, problem[0].projectId),
            eq(synapsisLearning.userId, userId),
          ),
        )
        .orderBy(desc(synapsisLearning.createdAt))
    : []

  const strategyIds = strategies.map((row) => row.strategyId)
  const outputs =
    strategyIds.length === 0
      ? []
      : await db
          .select()
          .from(synapsisOutputs)
          .where(
            and(eq(synapsisOutputs.userId, userId), inArray(synapsisOutputs.strategyId, strategyIds)),
          )
          .orderBy(desc(synapsisOutputs.createdAt))

  const outputIds = outputs.map((row) => row.outputId)
  const outcomes =
    outputIds.length === 0
      ? []
      : await db
          .select()
          .from(synapsisOutcomes)
          .where(
            and(eq(synapsisOutcomes.userId, userId), inArray(synapsisOutcomes.outputId, outputIds)),
          )
          .orderBy(desc(synapsisOutcomes.createdAt))

  return {
    problem: problem[0] ?? null,
    evidence,
    interpretations,
    strategies,
    outputs,
    outcomes,
    learning,
  }
}
