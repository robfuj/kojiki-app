import { and } from 'drizzle-orm'
import { appendSentinelEntry, type SentinelEntryType } from '@/lib/sentinel'
import { interpret } from './frame'
import { strategise } from './decide'

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
export const STAGES = [
  'frame',
  'evidence',
  'interpret',
  'strategise',
  'output',
  'outcome',
  'learn',
] as const

export type SynapsisStage = (typeof STAGES)[number]

export const STAGE_ENTRY: Record<SynapsisStage, SentinelEntryType> = {
  frame: 'synapsis_framed',
  evidence: 'synapsis_evidenced',
  interpret: 'synapsis_interpreted',
  strategise: 'synapsis_strategised',
  output: 'synapsis_output',
  outcome: 'synapsis_outcome',
  learn: 'synapsis_learning',
}

/** Prefixed, fixed-width ids so a stage artifact is recognisable in a log. */
export function stageId(prefix: string): string {
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

export interface StageContext {
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
export async function requireStage(
  stage: SynapsisStage,
  predecessor: SynapsisStage,
  problemId: string,
  exists: () => Promise<boolean>,
): Promise<void> {
  if (await exists()) return
  throw new SynapsisOrderError(stage, predecessor, problemId)
}

export async function sealStage(
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
