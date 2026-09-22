import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  causalChains,
  causalNodes,
  causalTransitions,
  governanceChanges,
  synapsisLearning,
  synapsisOutcomes,
  synapsisOutputs,
  synapsisProblems,
} from '@/lib/db/schema'
import { canonicalJson, sha256Hex } from '@/lib/sentinel'

/**
 * The causal chain and synapsis records — the upstream engine's JSONB replay
 * of a dispatch. A chain opens when work is dispatched; every stage appends a
 * hash-linked node; transitions record what went in and what came out; the
 * chain closes when the outcome (and any learning) lands.
 */

export async function startChain(input: {
  userId: string
  projectId: string
  dispatchId: string
}): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(causalChains).values({
    id,
    userId: input.userId,
    projectId: input.projectId,
    dispatchId: input.dispatchId,
  })
  return id
}

export async function findChainByDispatch(
  userId: string,
  dispatchId: string,
): Promise<{ id: string } | null> {
  const [chain] = await db
    .select({ id: causalChains.id })
    .from(causalChains)
    .where(
      and(
        eq(causalChains.userId, userId),
        eq(causalChains.dispatchId, dispatchId),
      ),
    )
    .limit(1)
  return chain ?? null
}

export async function recordCausalNode(input: {
  userId: string
  chainId: string
  stage: string
  artifactType: string
  artifactId?: string | null
  content: unknown
  agentId?: string | null
  tools?: string[]
}): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(causalNodes).values({
    id,
    userId: input.userId,
    chainId: input.chainId,
    stage: input.stage,
    artifactType: input.artifactType,
    artifactId: input.artifactId ?? null,
    contentHash: sha256Hex(canonicalJson(input.content)),
    content: input.content as Record<string, unknown>,
    agentId: input.agentId ?? null,
    tools: input.tools ?? [],
  })
  return id
}

export async function recordTransition(input: {
  userId: string
  chainId: string
  fromStage: string
  toStage: string
  agentId?: string | null
  signer?: string | null
  signature?: string | null
  publicKey?: string | null
  inputSummary?: string | null
  outputSummary?: string | null
}): Promise<void> {
  await db.insert(causalTransitions).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    chainId: input.chainId,
    fromStage: input.fromStage,
    toStage: input.toStage,
    inputHash: input.inputSummary
      ? sha256Hex(canonicalJson(input.inputSummary))
      : null,
    outputHash: input.outputSummary
      ? sha256Hex(canonicalJson(input.outputSummary))
      : null,
    agentId: input.agentId ?? null,
    signer: input.signer ?? null,
    signature: input.signature ?? null,
    publicKey: input.publicKey ?? null,
    inputSummary: input.inputSummary ?? null,
    outputSummary: input.outputSummary ?? null,
  })
}

export async function completeChain(input: {
  userId: string
  chainId: string
  finalProblemId?: string | null
  finalOutputId?: string | null
  finalLearningId?: string | null
  totalTokens?: number | null
  totalLatencyMs?: number | null
}): Promise<void> {
  await db
    .update(causalChains)
    .set({
      completedAt: new Date(),
      ...(input.finalProblemId !== undefined
        ? { finalProblemId: input.finalProblemId }
        : {}),
      ...(input.finalOutputId !== undefined
        ? { finalOutputId: input.finalOutputId }
        : {}),
      ...(input.finalLearningId !== undefined
        ? { finalLearningId: input.finalLearningId }
        : {}),
      ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
      ...(input.totalLatencyMs !== undefined
        ? { totalLatencyMs: input.totalLatencyMs }
        : {}),
    })
    .where(
      and(
        eq(causalChains.id, input.chainId),
        eq(causalChains.userId, input.userId),
      ),
    )
}

// ── Synapsis stage records ──

export async function recordProblem(input: {
  userId: string
  projectId: string
  problemId: string
  dispatchId?: string | null
  goal: string
  context?: Record<string, unknown>
  assumptions?: string[]
  constraints?: string[]
  unknowns?: string[]
}): Promise<void> {
  await db
    .insert(synapsisProblems)
    .values({
      problemId: input.problemId,
      userId: input.userId,
      projectId: input.projectId,
      dispatchId: input.dispatchId ?? null,
      goal: input.goal,
      context: input.context ?? {},
      assumptions: input.assumptions ?? [],
      constraints: input.constraints ?? [],
      unknowns: input.unknowns ?? [],
    })
    .onConflictDoUpdate({
      target: synapsisProblems.problemId,
      set: {
        goal: input.goal,
        context: input.context ?? {},
        constraints: input.constraints ?? [],
      },
    })
}

export async function recordOutput(input: {
  userId: string
  projectId: string
  outputId: string
  strategyId?: string | null
  content: Record<string, unknown>
  measurementWindow?: Record<string, unknown>
  confidence?: string | null
}): Promise<void> {
  await db
    .insert(synapsisOutputs)
    .values({
      outputId: input.outputId,
      userId: input.userId,
      projectId: input.projectId,
      strategyId: input.strategyId ?? null,
      content: input.content,
      measurementWindow: input.measurementWindow ?? {},
      confidence: input.confidence ?? null,
    })
    .onConflictDoUpdate({
      target: synapsisOutputs.outputId,
      set: {
        content: input.content,
        measurementWindow: input.measurementWindow ?? {},
        confidence: input.confidence ?? null,
      },
    })
}

export async function recordOutcome(input: {
  userId: string
  outputId: string
  actuals?: Record<string, unknown>
  evaluations?: Record<string, unknown>
  outcomeScore?: string | null
  targetMet?: boolean | null
  converged?: boolean | null
  iterationCount?: number | null
  guardrailViolations?: unknown[]
  deviationAnalysis?: string | null
  confidence?: string | null
  kaizenIteration?: number | null
}): Promise<void> {
  const outcomeId = `outcome:${input.outputId}`
  await db
    .insert(synapsisOutcomes)
    .values({
      outcomeId,
      userId: input.userId,
      outputId: input.outputId,
      actuals: input.actuals ?? {},
      evaluations: input.evaluations ?? {},
      outcomeScore: input.outcomeScore ?? null,
      targetMet: input.targetMet ?? null,
      converged: input.converged ?? null,
      iterationCount: input.iterationCount ?? null,
      guardrailViolations: input.guardrailViolations ?? [],
      deviationAnalysis: input.deviationAnalysis ?? null,
      confidence: input.confidence ?? null,
      kaizenIteration: input.kaizenIteration ?? null,
    })
    .onConflictDoUpdate({
      target: synapsisOutcomes.outcomeId,
      set: {
        actuals: input.actuals ?? {},
        evaluations: input.evaluations ?? {},
        outcomeScore: input.outcomeScore ?? null,
        targetMet: input.targetMet ?? null,
        converged: input.converged ?? null,
        guardrailViolations: input.guardrailViolations ?? [],
      },
    })
}

export async function recordLearning(input: {
  userId: string
  projectId: string
  learningId: string
  experiences?: unknown[]
  patterns?: string[]
  reusableInsights?: string[]
  redefinitions?: Record<string, unknown>
  outcomeScore?: string | null
  guardrailViolations?: unknown[]
  confidence?: string | null
  kaizenIteration?: number | null
}): Promise<void> {
  await db
    .insert(synapsisLearning)
    .values({
      learningId: input.learningId,
      userId: input.userId,
      projectId: input.projectId,
      experiences: input.experiences ?? [],
      patterns: input.patterns ?? [],
      reusableInsights: input.reusableInsights ?? [],
      redefinitions: input.redefinitions ?? {},
      outcomeScore: input.outcomeScore ?? null,
      guardrailViolations: input.guardrailViolations ?? [],
      confidence: input.confidence ?? null,
      kaizenIteration: input.kaizenIteration ?? null,
    })
    .onConflictDoUpdate({
      target: synapsisLearning.learningId,
      set: {
        experiences: input.experiences ?? [],
        patterns: input.patterns ?? [],
        reusableInsights: input.reusableInsights ?? [],
        redefinitions: input.redefinitions ?? {},
      },
    })
}

/**
 * Every authority change lands here — the JSONB governance record the upstream
 * engine keeps so a decision can always be traced to its approver and payload.
 */
export async function recordGovernanceChange(input: {
  userId: string
  projectId: string
  changeType: string
  target?: string | null
  payload?: Record<string, unknown>
  reason?: string | null
  gateId?: string | null
  approver?: string | null
}): Promise<void> {
  await db.insert(governanceChanges).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    changeType: input.changeType,
    target: input.target ?? null,
    payload: input.payload ?? {},
    reason: input.reason ?? null,
    gateId: input.gateId ?? null,
    approver: input.approver ?? null,
  })
}
