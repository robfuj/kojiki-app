import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  synapsisEvidence,
  synapsisInterpretations,
  synapsisLearning,
  synapsisOutcomes,
  synapsisOutputs,
  synapsisProblems,
  synapsisStrategies,
} from '@/lib/db/schema'
import { parseSaccadeProblem } from '@/lib/schemas/governance'
import { appendSentinelEntry, type SentinelEntryType } from '@/lib/sentinel'

/**
 * The SYNAPSIS reasoning loop.
 *
 * Seven stages, each with its own table, run in a fixed order:
 *
 *   frame -> evidence -> interpret -> strategise -> output -> outcome -> learn
 *
 * The order is the point. An agent that could write a conclusion and then
 * backfill the justification would produce something indistinguishable from real
 * reasoning, so **every stage requires its predecessor to exist** and refuses to
 * run otherwise. Interpretation without evidence is rejected, strategy without
 * interpretation is rejected, and so on. The loop is a chain of obligations, not
 * a set of independent notes.
 *
 * Each stage is also sealed into SENTINEL. That is what makes the ordering
 * provable after the fact rather than merely enforced at write time: the ledger
 * shows the conclusion was reached *after* the evidence, with timestamps and
 * hashes, so a later reader does not have to take the agent's word for it.
 *
 * The final stage closes the loop. An outcome that did not converge produces a
 * redefinition, which becomes the framing of the next iteration — the same
 * problem re-framed with what the attempt taught, rather than the same attempt
 * repeated.
 */

/** Stage order. Index is what a stage must have behind it before it may run. */
const STAGES = [
  'frame',
  'evidence',
  'interpret',
  'strategise',
  'output',
  'outcome',
  'learn',
] as const

export type SynapsisStage = (typeof STAGES)[number]

const STAGE_ENTRY: Record<SynapsisStage, SentinelEntryType> = {
  frame: 'synapsis_framed',
  evidence: 'synapsis_evidenced',
  interpret: 'synapsis_interpreted',
  strategise: 'synapsis_strategised',
  output: 'synapsis_output',
  outcome: 'synapsis_outcome',
  learn: 'synapsis_learning',
}

/** Prefixed, fixed-width ids so a stage artifact is recognisable in a log. */
function stageId(prefix: string): string {
  const digits = Array.from(
    { length: 10 },
    () => crypto.getRandomValues(new Uint32Array(1))[0] % 10,
  ).join('')
  return `${prefix}-${digits}`
}

export class SynapsisOrderError extends Error {
  constructor(
    readonly stage: SynapsisStage,
    readonly missing: SynapsisStage,
    readonly problemId: string,
  ) {
    super(
      `Cannot run '${stage}' for ${problemId}: '${missing}' has not been recorded. ` +
        `The loop runs ${STAGES.join(' -> ')}.`,
    )
    this.name = 'SynapsisOrderError'
  }
}

interface StageContext {
  userId: string
  /**
   * Required, not optional. Every stage is sealed, and a seal without a project
   * cannot be attributed to a chain — so a stage that cannot name its project
   * cannot run.
   */
  projectId: string
  problemId: string
  /** Who ran the stage. Sealed as the signer, so each stage names its author. */
  actor: string
  objectiveId?: string | null
}

/**
 * Asserts a predecessor stage has produced a row.
 *
 * This is the enforcement point for the whole loop. It checks for an actual row
 * rather than trusting a caller's claim, because the guarantee is only worth
 * anything if it cannot be talked around.
 */
async function requireStage(
  stage: SynapsisStage,
  predecessor: SynapsisStage,
  problemId: string,
  exists: () => Promise<boolean>,
): Promise<void> {
  if (await exists()) return
  throw new SynapsisOrderError(stage, predecessor, problemId)
}

async function sealStage(
  stage: SynapsisStage,
  context: StageContext,
  subjectTitle: string,
  payloadRef: string,
  payload: Record<string, unknown>,
) {
  return appendSentinelEntry({
    userId: context.userId,
    projectId: context.projectId,
    entryType: STAGE_ENTRY[stage],
    subjectKey: context.problemId,
    subjectTitle,
    signer: context.actor,
    objectiveId: context.objectiveId ?? null,
    payloadRef,
    payload: { problemId: context.problemId, stage, ...payload },
  })
}

// ---------------------------------------------------------------------------
// Stage 1 — frame
// ---------------------------------------------------------------------------

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
