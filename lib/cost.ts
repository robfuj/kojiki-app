import type { CatalogEntry } from '@/lib/providers'

/**
 * Cost estimation for sub-agent work.
 *
 * The numbers here are measured, not guessed. A verified task cycle makes four
 * model calls — the head assigns, the sub-agent runs, Kaizen Checks, the head
 * reabsorbs — and the token volumes below were taken from live task rows and the
 * assembled prompt sources in this codebase.
 *
 * Estimates stay honest by separating what is fixed from what scales. The fixed
 * part is the system prompt, the ontology entry and the orientation context, which
 * every call carries regardless of the task. The variable part is the brief, which
 * is re-sent on every call, and the success criteria, which three of the four calls
 * need. A task with a long brief and many criteria therefore costs visibly more
 * than a short one, which is the behaviour a user needs in order to plan.
 */

/** Rough chars-per-token for the English prose these prompts are made of. */
export const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

interface CallProfile {
  name: string
  fixedIn: number
  fixedOut: number
}

/**
 * The four calls a verified task cycle makes, with measured fixed overheads.
 * Summed fixed input is 6,400 tokens and fixed output 1,500.
 */
const CYCLE_CALLS: readonly CallProfile[] = [
  { name: 'assign', fixedIn: 2200, fixedOut: 550 },
  { name: 'run', fixedIn: 1900, fixedOut: 350 },
  { name: 'check', fixedIn: 1000, fixedOut: 280 },
  { name: 'reabsorb', fixedIn: 1300, fixedOut: 320 },
]

/** The brief travels with every call in the cycle. */
const BRIEF_RESENDS = 4

/** Assign, run and check all need the criteria; reabsorb works from the result. */
const CRITERIA_RESENDS = 3

/** Measured average size of one rendered success criterion, in tokens. */
const TOKENS_PER_CRITERION = 30

/** Output grows loosely with brief length: a longer brief asks for more work. */
const OUTPUT_RATIO_TO_BRIEF = 0.35

export interface TaskShape {
  briefTokens: number
  criterionCount: number
}

export interface CostEstimate {
  inputTokens: number
  outputTokens: number
  costUsd: number
  /** Per-call breakdown, so the UI can show where the tokens go. */
  calls: { name: string; inputTokens: number; outputTokens: number }[]
}

const FIXED_INPUT = CYCLE_CALLS.reduce((sum, call) => sum + call.fixedIn, 0)
const FIXED_OUTPUT = CYCLE_CALLS.reduce((sum, call) => sum + call.fixedOut, 0)

/**
 * Estimates what one full task cycle will consume and cost on a given model.
 *
 * Returns zero cost for free-tier models rather than omitting them, so the UI can
 * show "$0.00" as a real option rather than an unknown.
 */
export function estimateTaskCost(
  shape: TaskShape,
  entry: Pick<CatalogEntry, 'inputPricePer1m' | 'outputPricePer1m'> | null,
): CostEstimate {
  const criteriaTokens = shape.criterionCount * TOKENS_PER_CRITERION

  const inputTokens =
    FIXED_INPUT + shape.briefTokens * BRIEF_RESENDS + criteriaTokens * CRITERIA_RESENDS

  const outputTokens = FIXED_OUTPUT + Math.round(shape.briefTokens * OUTPUT_RATIO_TO_BRIEF)

  // Spread the variable load across calls proportionally to their fixed share, so
  // the breakdown sums to the total rather than being a separate calculation.
  const calls = CYCLE_CALLS.map((call) => {
    const share = call.fixedIn / FIXED_INPUT
    return {
      name: call.name,
      inputTokens: Math.round(call.fixedIn + (inputTokens - FIXED_INPUT) * share),
      outputTokens: Math.round(call.fixedOut + (outputTokens - FIXED_OUTPUT) * share),
    }
  })

  return {
    inputTokens,
    outputTokens,
    costUsd: entry ? priceOf(inputTokens, outputTokens, entry) : 0,
    calls,
  }
}

/** USD cost of a token count at a model's published per-million prices. */
export function priceOf(
  inputTokens: number,
  outputTokens: number,
  entry: Pick<CatalogEntry, 'inputPricePer1m' | 'outputPricePer1m'>,
): number {
  return (
    (inputTokens / 1_000_000) * entry.inputPricePer1m +
    (outputTokens / 1_000_000) * entry.outputPricePer1m
  )
}

/**
 * Projects ongoing monthly cost from a task volume.
 *
 * This is what answers "what will continuous marketing work cost me" — the user
 * supplies how many tasks a month the department will run, and the per-cycle
 * estimate scales linearly.
 */
export function projectMonthlyCost(
  tasksPerMonth: number,
  estimate: Pick<CostEstimate, 'costUsd'>,
): number {
  return tasksPerMonth * estimate.costUsd
}

/**
 * Formats USD at a precision that suits the magnitude.
 *
 * Sub-agent work costs fractions of a cent per task, so a fixed two decimals
 * would render almost everything as "$0.00" and hide the differences the user is
 * trying to compare. Below a cent it shows four decimals; above it, two.
 */
export function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'
  if (amount === 0) return '$0.00'
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  if (amount < 1) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}

/** Compact token count for display: 7,194 rather than 7194. */
export function formatTokens(count: number | null | undefined): string {
  if (count === null || count === undefined) return '—'
  return count.toLocaleString('en-US')
}
