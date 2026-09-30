import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { synapsisEvidence, synapsisInterpretations, synapsisProblems } from '@/lib/db/schema'
import { parseSaccadeProblem } from '@/lib/schemas/governance'
import { stageId, StageContext, requireStage, sealStage } from './core'
import { strategise } from './decide'

export interface FrameInput extends StageContext {
  /**
   * The SACCADE framing. Parsed with id repair, because models routinely emit a
   * near-miss problem id and rejecting outright would discard an otherwise sound
   * framing over a formatting slip.
   */
  framing: unknown
  context?: Record<string, unknown>
  assumptions?: string[]
  unknowns?: string[]
}

/**
 * Opens a problem.
 *
 * The framing carries its own success criteria, constraints and owner, so the
 * problem is defined before any work is done — which is what lets the outcome
 * stage later compare against a target that was fixed in advance rather than
 * chosen after the result was known.
 */
export async function frameProblem(input: FrameInput) {
  const parsed = parseSaccadeProblem(input.framing)
  if (!parsed.ok) throw new Error(`Invalid framing: ${parsed.error}`)

  const { problem } = parsed
  const problemId = problem.problemId

  const existing = await db
    .select({ problemId: synapsisProblems.problemId })
    .from(synapsisProblems)
    .where(eq(synapsisProblems.problemId, problemId))
    .limit(1)

  // A problem id is the spine of the whole loop. Re-framing the same id would
  // silently rewrite what every later stage was answering, so a repeat is
  // refused: a genuinely new attempt at the same problem is a new iteration with
  // its own id, linked through the learning stage's redefinition.
  if (existing.length > 0) {
    throw new Error(`Problem ${problemId} is already framed`)
  }

  await db.insert(synapsisProblems).values({
    problemId,
    userId: input.userId,
    projectId: input.projectId,
    dispatchId: null,
    goal: problem.title,
    context: {
      ...(input.context ?? {}),
      description: problem.description,
      successCriteria: problem.successCriteria,
      constraints: problem.constraints,
      departments: problem.departments,
      owner: problem.owner,
      kaizenClassification: problem.kaizenClassification,
      repairedId: parsed.repaired,
    },
    assumptions: input.assumptions ?? [],
    constraints: problem.constraints,
    unknowns: input.unknowns ?? [],
  })

  const entry = await sealStage('frame', input, problem.title, problemId, {
    goal: problem.title,
    owner: problem.owner,
    departments: problem.departments,
    successCriteria: problem.successCriteria,
    kaizenClassification: problem.kaizenClassification,
    repairedId: parsed.repaired,
  })

  return { problemId, repaired: parsed.repaired, sentinelEntryId: entry.id }
}

// ---------------------------------------------------------------------------
// Stage 2 — evidence
// ---------------------------------------------------------------------------

export interface EvidenceInput extends StageContext {
  question: string
  answer: string
  source: string
  /** high | medium | low — how much the answer can bear. */
  confidence: 'high' | 'medium' | 'low'
  /** retrieved | partial | unavailable — whether the search actually found it. */
  retrievalState: 'retrieved' | 'partial' | 'unavailable'
  coverageLimits?: string[]
  sufficiency?: Record<string, unknown>
}

/**
 * Records one piece of evidence.
 *
 * `retrievalState` and `coverageLimits` exist so that a gap is recorded as a gap.
 * An agent that could not find something must say so, because "no evidence found"
 * and "evidence of absence" lead to opposite conclusions and look identical if
 * only the answer is stored.
 */
export async function gatherEvidence(input: EvidenceInput) {
  await requireStage('evidence', 'frame', input.problemId, async () => {
    const rows = await db
      .select({ problemId: synapsisProblems.problemId })
      .from(synapsisProblems)
      .where(
        and(
          eq(synapsisProblems.problemId, input.problemId),
          eq(synapsisProblems.userId, input.userId),
        ),
      )
      .limit(1)
    return rows.length > 0
  })

  const findingId = stageId('FIND')

  await db.insert(synapsisEvidence).values({
    findingId,
    userId: input.userId,
    problemId: input.problemId,
    question: input.question,
    answer: input.answer,
    source: input.source,
    confidence: input.confidence,
    retrievalState: input.retrievalState,
    coverageLimits: input.coverageLimits ?? [],
    sufficiency: input.sufficiency ?? {},
  })

  const entry = await sealStage('evidence', input, input.question, findingId, {
    findingId,
    source: input.source,
    confidence: input.confidence,
    retrievalState: input.retrievalState,
    coverageLimits: input.coverageLimits ?? [],
  })

  return { findingId, sentinelEntryId: entry.id }
}

// ---------------------------------------------------------------------------
// Stage 3 — interpret
// ---------------------------------------------------------------------------

export interface InterpretInput extends StageContext {
  synthesis: string
  confidence: 'high' | 'medium' | 'low'
  keyDrivers?: string[]
  /** Which findings this interpretation rests on. */
  findingRefs?: string[]
}

/**
 * Interprets the evidence.
 *
 * Requires at least one recorded finding. An interpretation with no evidence
 * behind it is a guess, and the loop's whole purpose is to make the difference
 * between a guess and a conclusion visible in the record.
 */
export async function interpret(input: InterpretInput) {
  await requireStage('interpret', 'evidence', input.problemId, async () => {
    const rows = await db
      .select({ findingId: synapsisEvidence.findingId })
      .from(synapsisEvidence)
      .where(
        and(
          eq(synapsisEvidence.problemId, input.problemId),
          eq(synapsisEvidence.userId, input.userId),
        ),
      )
      .limit(1)
    return rows.length > 0
  })

  const interpretationId = stageId('INTP')

  await db.insert(synapsisInterpretations).values({
    interpretationId,
    userId: input.userId,
    problemId: input.problemId,
    synthesis: input.synthesis,
    confidence: input.confidence,
    keyDrivers: input.keyDrivers ?? [],
  })

  const entry = await sealStage('interpret', input, input.synthesis, interpretationId, {
    interpretationId,
    confidence: input.confidence,
    keyDrivers: input.keyDrivers ?? [],
    findingRefs: input.findingRefs ?? [],
  })

  return { interpretationId, sentinelEntryId: entry.id }
}

// ---------------------------------------------------------------------------
// Stage 4 — strategise
// ---------------------------------------------------------------------------
