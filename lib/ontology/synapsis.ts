/**
 * The SYNAPSIS decision cycle. The data is generated from the vendored
 * ontology/prompts/stages/0N-<stage>.md sources by
 * scripts/generate-ontology.mjs — this module only adds lookup helpers.
 *
 * Each stage carries its upstream `authority` question, its `boundary` (the
 * "Must Not Become" / "Forbidden" list — the work this stage must not silently
 * perform), and the full upstream `prompt` text.
 */

import { SYNAPSIS_STAGES, type SynapsisStage } from './generated'

export { SYNAPSIS_STAGES, type SynapsisStage } from './generated'

export const STAGE_BY_KEY = new Map(SYNAPSIS_STAGES.map((s) => [s.key, s]))

export function getStage(key: string): SynapsisStage | undefined {
  return STAGE_BY_KEY.get(key)
}

/** The stage a cycle advances to after `key`, or undefined at LEARNING. */
export function nextStage(key: string): SynapsisStage | undefined {
  const current = getStage(key)
  if (!current) return undefined
  return SYNAPSIS_STAGES.find((s) => s.index === current.index + 1)
}

/** Boundary rendered as prompt-ready prose. */
export function stageBoundary(stage: SynapsisStage): string {
  return stage.boundary.map((item) => `- ${item}`).join('\n')
}
