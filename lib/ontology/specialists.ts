/**
 * Specialist registry. The data is generated from the vendored
 * ontology/specialists/<key>/config.yaml sources by
 * scripts/generate-ontology.mjs — this module only adds lookup helpers.
 */

import { SPECIALISTS, type Specialist, type SubAgent } from './generated'

export {
  SPECIALISTS,
  ONTOLOGY_MANIFEST,
  ONTOLOGY_SOURCE,
  type DecisionRightVerb,
  type DecisionRights,
  type Handoff,
  type Specialist,
  type SubAgent,
} from './generated'

export const SPECIALIST_BY_KEY = new Map(SPECIALISTS.map((s) => [s.key, s]))

export function getSpecialist(key: string): Specialist | undefined {
  return SPECIALIST_BY_KEY.get(key)
}

/**
 * Every sub-agent in the ontology, flattened. A sub-agent key is unique to its
 * parent department, so lookups are keyed by `parent/key`.
 */
export const SUB_AGENTS = SPECIALISTS.flatMap((specialist) => specialist.subAgents)

const SUB_AGENT_BY_COMPOSITE = new Map(
  SUB_AGENTS.map((sub) => [`${sub.parentSpecialistKey}/${sub.key}`, sub]),
)

/** Resolves a sub-agent within its parent department. */
export function getSubAgent(
  parentSpecialistKey: string,
  subAgentKey: string,
): SubAgent | undefined {
  return SUB_AGENT_BY_COMPOSITE.get(`${parentSpecialistKey}/${subAgentKey}`)
}

/** The sub-agents a department head can dispatch work to. */
export function subAgentsOf(specialistKey: string): SubAgent[] {
  return getSpecialist(specialistKey)?.subAgents ?? []
}

/** Human-readable label, e.g. "engineering-platform" -> "Engineering Platform". */
export function specialistLabel(key: string): string {
  return key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
